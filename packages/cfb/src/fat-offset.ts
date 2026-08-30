export function sectorOffset(sector: number, sectorSize: number): number {
  return (sector + 1) * sectorSize;
}
