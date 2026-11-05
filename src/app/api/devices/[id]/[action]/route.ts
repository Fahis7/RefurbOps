import { read, transact } from "@/server/store";
import { body, handle, snapshot } from "@/server/http";
import { generateListing } from "@/server/ai";
import { approveAndList, completeRepair, grade, move, recordQC, setListingText } from "@/domain/service";
import { DomainError, STAGES, type MarketplaceId, type Stage } from "@/domain/types";
import { MARKETPLACE_IDS } from "@/domain/pricing";

/**
 * POST /api/devices/:id/:action
 *   move     { to, note? }                       – generic stage change (rules in domain/pipeline.ts)
 *   grade    { cosmeticScore, batteryHealth, needsRepair, aiSuggestion? }
 *   repair   { cost, note }
 *   qc       { checkId, passed }
 *   list     { marketplaces, price? }             – QC passed → LISTED + publish
 *   listing  {}                                   – AI-generate marketplace listing text
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  return handle(async () => {
    const { id, action } = await ctx.params;
    const input = await body<Record<string, unknown>>(req).catch(() => ({}) as Record<string, unknown>);
    const now = new Date().toISOString();

    switch (action) {
      case "move": {
        const to = input.to as Stage;
        if (!STAGES.includes(to)) throw new DomainError("Invalid stage");
        const { state } = await transact((s) => ({ state: move(s, id, to, now, input.note as string | undefined) }));
        return snapshot(state);
      }
      case "grade": {
        const { state } = await transact((s) => ({
          state: grade(
            s,
            id,
            {
              cosmeticScore: Number(input.cosmeticScore),
              batteryHealth: Number(input.batteryHealth),
              needsRepair: Boolean(input.needsRepair),
              aiSuggestion: aiSuggestionFrom(input.aiSuggestion),
            },
            now,
          ),
        }));
        return snapshot(state);
      }
      case "repair": {
        const { state } = await transact((s) => ({
          state: completeRepair(s, id, { cost: Number(input.cost), note: String(input.note ?? "") }, now),
        }));
        return snapshot(state);
      }
      case "qc": {
        const { state } = await transact((s) => ({ state: recordQC(s, id, String(input.checkId), Boolean(input.passed)) }));
        return snapshot(state);
      }
      case "list": {
        const mps = (Array.isArray(input.marketplaces) ? input.marketplaces : []).filter((m): m is MarketplaceId =>
          MARKETPLACE_IDS.includes(m as MarketplaceId),
        );
        const price = input.price == null || input.price === "" ? undefined : Number(input.price);
        if (price !== undefined && !(price > 0)) throw new DomainError("Price must be positive");
        const { state } = await transact((s) => ({ state: approveAndList(s, id, mps, now, price) }));
        return snapshot(state);
      }
      case "listing": {
        // The slow AI call happens OUTSIDE the transaction so it never blocks other writes.
        const device = (await read()).devices.find((d) => d.id === id);
        if (!device) throw new DomainError(`Device ${id} not found`);
        const { warning, ...listing } = await generateListing(device);
        const { state } = await transact((s) => ({ state: setListingText(s, id, listing) }));
        return snapshot(state, { warning });
      }
      default:
        throw new DomainError(`Unknown action "${action}"`);
    }
  });
}

/** Optional applied AI photo suggestion; shape-checked here, range-checked by the domain. */
function aiSuggestionFrom(v: unknown): { cosmeticScore: number; confidence: number } | undefined {
  if (v == null) return undefined;
  if (typeof v !== "object") throw new DomainError("Invalid AI suggestion");
  const o = v as Record<string, unknown>;
  return { cosmeticScore: Number(o.cosmeticScore), confidence: Number(o.confidence) };
}
