export function getVisiblePages(totalPages: number, currentPage: number, maxVisible: number = 5): (number | string)[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  pages.add(currentPage);

  let remaining = maxVisible - pages.size;
  let offset = 1;
  while (remaining > 0) {
    const below = currentPage - offset;
    if (below >= 2) {
      pages.add(below);
      remaining--;
    }
    const above = currentPage + offset;
    if (remaining > 0 && above <= totalPages - 1) {
      pages.add(above);
      remaining--;
    }
    offset++;
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | string)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push("...");
    }
    result.push(sorted[i]);
  }
  return result;
}
