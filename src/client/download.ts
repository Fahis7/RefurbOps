// Browser download of a generated file. No network call, so it works the same in live and demo mode.

const pad = (n: number) => String(n).padStart(2, "0");

/** refurbops-devices-YYYY-MM-DD.csv, using the user's local calendar date (not UTC). */
export function exportFileName(kind: "devices" | "sales", date: Date): string {
  return `refurbops-${kind}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.csv`;
}

/** Download text as a file via a Blob and a temporary <a download>. */
export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick: some browsers start the download asynchronously after click().
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
