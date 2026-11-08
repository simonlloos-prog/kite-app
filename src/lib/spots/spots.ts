import type { LatLon } from '../wind/arome'
import type { Sector } from '../wind/units'

export type Level = 'Débutant' | 'Confirmé' | 'Expert' | 'Expert +'

export interface Spot extends LatLon {
  id: string
  name: string
  /** Area heading, as in the source table. */
  area: string
  /** Wind directions (where it comes from) that work well 🤙. */
  good: Sector[]
  /** Directions that work, but not great 👍. */
  ok: Sector[]
  /** Wind from the land, blowing out to sea or across the lake: dangerous ⚠. */
  offshore: Sector[]
  level: Level
  /** Restrictions and bans (summer, nature reserve…). */
  note?: string
  /**
   * Where the wind is read, a little out on the water: next to the shore, the model slows the
   * wind down (land friction) and rated spots "too light" by mistake. Defaults to the spot.
   */
  windPoint?: LatLon
  /**
   * Kite window around high water, hours either side (windspot.fr gave ±2 h on most of the Bassin,
   * widened to ±3 h by the user): outside it, the spot is too dry. Absent: no tide, or sailable at
   * any tide.
   */
  tide?: number
}

/**
 * Spots, orientations, levels and restrictions from the "Trouve ton spot autour de Bordeaux"
 * table (KitesurfBordeaux.com, updated 06/07/2018), plus L'Aérium, Taussat and Soulac.
 * Orientations (ideal = good, sailable = ok, offshore) and tide windows from windspot.fr (2026)
 * where it lists the spot; the ocean beaches it lacks keep the table's directions and take
 * Le Grand Crohot's offshore sectors, on the same straight coast. Positions and wind points
 * given by the user. Les Aigrettes (Lac de Cazaux, "Interdit") is left out.
 */
export const SPOTS: Spot[] = [
  // Gironde estuary
  { id: 'bonne-anse', name: 'Bonne Anse', area: 'Estuaire', lat: 45.687, lon: -1.211109, good: ['S', 'SO', 'O'], ok: ['SE', 'NO'], offshore: ['N', 'NE', 'E'], level: 'Débutant' },
  { id: 'chambrette', name: 'La Chambrette', area: 'Estuaire', lat: 45.55004, lon: -1.057843, windPoint: { lat: 45.549691, lon: -1.051608 }, good: ['N', 'NE', 'E', 'SE'], ok: ['NO'], offshore: ['S', 'SO', 'O'], level: 'Confirmé' },
  // Ocean, Médoc: not in the table, orientations copied from the ocean beaches below.
  { id: 'soulac', name: 'Soulac', area: 'Océan nord', lat: 45.516681, lon: -1.127357, windPoint: { lat: 45.51889, lon: -1.133818 }, good: ['N', 'NO', 'SO', 'O'], ok: [], offshore: ['NE', 'E', 'SE', 'S'], level: 'Expert' },
  // Lac d'Hourtin
  { id: 'hourtin-port', name: 'Hourtin Port', area: "Lac d'Hourtin", lat: 45.17877, lon: -1.085813, windPoint: { lat: 45.177984, lon: -1.087369 }, good: ['S', 'SO', 'O', 'NO'], ok: ['N', 'SE'], offshore: ['NE', 'E'], level: 'Débutant' },
  { id: 'lachanau', name: 'Lachanau', area: "Lac d'Hourtin", lat: 45.165521, lon: -1.078767, windPoint: { lat: 45.164417, lon: -1.083483 }, good: ['S', 'SO', 'O', 'NO'], ok: ['N', 'SE'], offshore: ['NE', 'E'], level: 'Confirmé' },
  // Lac de Lacanau
  { id: 'lacanau-lac', name: 'Lacanau Lac', area: 'Lac de Lacanau', lat: 44.981246, lon: -1.098291, windPoint: { lat: 44.980405, lon: -1.100349 }, good: ['SO', 'O', 'NO'], ok: ['N', 'S'], offshore: ['NE', 'E', 'SE'], level: 'Débutant', note: 'Pas avant 19 h l\'été' },
  // Ocean, north of the Bassin
  // Lacanau Océan replaces the table's Lacanau Sud and Super Sud, same restrictions. Lacanau Océan
  // and Le Porge work like Le Grand Crohot (user).
  { id: 'lacanau-ocean', name: 'Lacanau Océan', area: 'Océan nord', lat: 45.000973, lon: -1.202472, windPoint: { lat: 45.003279, lon: -1.206235 }, good: ['N', 'SO', 'O', 'NO'], ok: [], offshore: ['NE', 'E', 'SE', 'S'], level: 'Expert', note: "Interdit l'été" },
  { id: 'le-porge', name: 'Le Porge', area: 'Océan nord', lat: 44.892182, lon: -1.218879, windPoint: { lat: 44.892612, lon: -1.224644 }, good: ['N', 'SO', 'O', 'NO'], ok: [], offshore: ['NE', 'E', 'SE', 'S'], level: 'Expert', note: 'Panneaux Abeilles' },
  { id: 'grand-crohot', name: 'Le Grand Crohot', area: 'Océan nord', lat: 44.797919, lon: -1.235184, windPoint: { lat: 44.797487, lon: -1.236964 }, good: ['N', 'SO', 'O', 'NO'], ok: [], offshore: ['NE', 'E', 'SE', 'S'], level: 'Expert', note: 'Panneaux Abeilles' },
  // Bassin d'Arcachon
  { id: 'claouey', name: 'Claouey - Bertic', area: "Bassin d'Arcachon", lat: 44.747475, lon: -1.172587, windPoint: { lat: 44.746823, lon: -1.17116 }, good: ['NE', 'E', 'SE', 'S'], ok: ['SO'], offshore: ['N', 'O', 'NO'], level: 'Confirmé', tide: 3, note: "Interdit l'été" },
  { id: 'aerium', name: "L'Aérium", area: "Bassin d'Arcachon", lat: 44.75506, lon: -1.134345, windPoint: { lat: 44.754918, lon: -1.135271 }, good: ['S', 'SO', 'O', 'NO'], ok: ['SE'], offshore: ['N', 'NE', 'E'], level: 'Confirmé', tide: 3 },
  { id: 'betey', name: 'Le Betey', area: "Bassin d'Arcachon", lat: 44.733467, lon: -1.092514, windPoint: { lat: 44.732001, lon: -1.093669 }, good: ['SE', 'S', 'SO', 'O', 'NO'], ok: ['E'], offshore: ['N', 'NE'], level: 'Débutant', tide: 3, note: "Interdit l'été" },
  // Not in the table: orientations from windspot.fr.
  { id: 'taussat', name: 'Taussat', area: "Bassin d'Arcachon", lat: 44.716687, lon: -1.071281, windPoint: { lat: 44.718048, lon: -1.073054 }, good: ['SE', 'S', 'SO', 'O', 'NO'], ok: ['E'], offshore: ['N', 'NE'], level: 'Débutant', tide: 3 },
  { id: 'la-hume', name: 'La Hume', area: "Bassin d'Arcachon", lat: 44.645325, lon: -1.115474, windPoint: { lat: 44.647832, lon: -1.113052 }, good: ['N', 'NE', 'E', 'O', 'NO'], ok: [], offshore: ['SE', 'S', 'SO'], level: 'Débutant', tide: 3, note: 'Période de chasse' },
  // Not in the table: orientations from windspot.fr, sailable at any tide.
  { id: 'cva', name: 'Cercle Voile Arcachon', area: "Bassin d'Arcachon", lat: 44.660221, lon: -1.143146, windPoint: { lat: 44.661006, lon: -1.142008 }, good: ['N', 'NE', 'E', 'O', 'NO'], ok: ['SE'], offshore: ['S', 'SO'], level: 'Confirmé', note: "Déconseillé l'été (baigneurs)" },
  { id: 'arbousiers', name: 'Les Arbousiers', area: "Bassin d'Arcachon", lat: 44.64641, lon: -1.200347, windPoint: { lat: 44.647148, lon: -1.200423 }, good: ['N', 'SO', 'O', 'NO'], ok: ['NE', 'S'], offshore: ['E', 'SE'], level: 'Confirmé', note: "Inaccessible l'été" },
  // Ocean, south of the Bassin
  { id: 'lagune-sud', name: 'La Lagune Sud', area: 'Océan sud', lat: 44.548778, lon: -1.249725, windPoint: { lat: 44.549675, lon: -1.250783 }, good: ['N', 'NO', 'O', 'SO'], ok: [], offshore: ['NE', 'E', 'SE', 'S'], level: 'Expert', note: 'Réserve naturelle' },
  { id: 'la-salie', name: 'La Salie', area: 'Océan sud', lat: 44.521294, lon: -1.255038, windPoint: { lat: 44.521359, lon: -1.260705 }, good: ['N', 'NO', 'SO', 'O'], ok: [], offshore: ['NE', 'E', 'SE', 'S'], level: 'Expert +', note: 'Panneaux Abeilles' },
  { id: 'biscarrosse', name: 'Biscarrosse', area: 'Océan sud', lat: 44.445565, lon: -1.256221, windPoint: { lat: 44.445491, lon: -1.258682 }, good: ['N', 'NO', 'SO', 'O'], ok: [], offshore: ['NE', 'E', 'SE', 'S'], level: 'Expert', note: 'Panneaux Abeilles' },
  // Lac de Cazaux-Sanguinet and Lac de Biscarrosse
  { id: 'laouga', name: 'Laouga', area: 'Lac de Cazaux', lat: 44.520582, lon: -1.176372, windPoint: { lat: 44.519541, lon: -1.175587 }, good: ['E', 'SE', 'S'], ok: ['NE', 'SO'], offshore: ['N', 'O', 'NO'], level: 'Débutant', note: "Interdit l'été" },
  { id: 'estey', name: "Port de l'Estey", area: 'Lac de Cazaux', lat: 44.482797, lon: -1.103575, windPoint: { lat: 44.483944, lon: -1.103947 }, good: ['N', 'NE', 'O', 'NO'], ok: ['E', 'SO'], offshore: ['SE', 'S'], level: 'Confirmé', note: "Interdit l'été" },
  { id: 'mayotte', name: 'Mayotte', area: 'Lac de Cazaux', lat: 44.439603, lon: -1.160313, windPoint: { lat: 44.440562, lon: -1.162344 }, good: ['N', 'O', 'NO'], ok: ['NE', 'SO'], offshore: ['E', 'SE', 'S'], level: 'Débutant', note: 'Interdit hors été' },
  { id: 'navarrosse', name: 'Navarrosse', area: 'Lac de Cazaux', lat: 44.43483, lon: -1.165677, windPoint: { lat: 44.436076, lon: -1.166859 }, good: ['N', 'O', 'NO'], ok: ['NE', 'SO'], offshore: ['E', 'SE', 'S'], level: 'Débutant', note: "Interdit l'été" },
  { id: 'ispe', name: 'Ispe', area: 'Lac de Biscarrosse', lat: 44.444679, lon: -1.192241, windPoint: { lat: 44.446166, lon: -1.189892 }, good: ['N', 'NE', 'E', 'SE'], ok: ['NO'], offshore: ['S', 'SO', 'O'], level: 'Débutant', note: "Interdit l'été" },
]

/** Where to read the wind of a spot, or of a picked point that may be one. */
export const windPointOf = (p: LatLon & { windPoint?: LatLon }): LatLon => p.windPoint ?? p

export function distanceKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function nearestSpot(p: LatLon, maxKm = 2, spots = SPOTS): Spot | null {
  let best: Spot | null = null
  let bestD = maxKm
  for (const s of spots) {
    const d = distanceKm(p, s)
    if (d <= bestD) [best, bestD] = [s, d]
  }
  return best
}
