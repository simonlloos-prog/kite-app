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
  level: Level
  /** Restrictions and bans (summer, nature reserve…). */
  note?: string
  /**
   * Where the wind is read, a little out on the water: next to the shore, the model slows the
   * wind down (land friction) and rated spots "too light" by mistake. Defaults to the spot.
   */
  windPoint?: LatLon
  /**
   * Kite window around high water, hours either side (windspot.fr): outside it, the spot is too
   * dry. Absent: no tide, or sailable at any tide.
   */
  tide?: number
}

/**
 * Spots, orientations, levels and restrictions from the "Trouve ton spot autour de Bordeaux"
 * table (KitesurfBordeaux.com, updated 06/07/2018), plus L'Aérium, Taussat and Soulac.
 * Tide windows from windspot.fr (2026). Positions and wind points given by the user. Les Aigrettes (Lac de Cazaux, "Interdit") is
 * left out. Spots not in the table have guessed orientations.
 */
export const SPOTS: Spot[] = [
  // Gironde estuary
  { id: 'bonne-anse', name: 'Bonne Anse', area: 'Estuaire', lat: 45.687, lon: -1.211109, good: ['NO', 'O', 'SO', 'S', 'SE'], ok: [], level: 'Débutant' },
  { id: 'chambrette', name: 'La Chambrette', area: 'Estuaire', lat: 45.55004, lon: -1.057843, windPoint: { lat: 45.549691, lon: -1.051608 }, good: ['N', 'SE', 'E', 'NE'], ok: [], level: 'Confirmé' },
  // Ocean, Médoc: not in the table, orientations copied from the ocean beaches below.
  { id: 'soulac', name: 'Soulac', area: 'Océan nord', lat: 45.516681, lon: -1.127357, windPoint: { lat: 45.51889, lon: -1.133818 }, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert', note: 'Orientations à vérifier' },
  // Lac d'Hourtin
  { id: 'hourtin-port', name: 'Hourtin Port', area: "Lac d'Hourtin", lat: 45.17877, lon: -1.085813, windPoint: { lat: 45.177984, lon: -1.087369 }, good: ['O', 'SO', 'S'], ok: ['N', 'NO'], level: 'Débutant' },
  { id: 'lachanau', name: 'Lachanau', area: "Lac d'Hourtin", lat: 45.165521, lon: -1.078767, windPoint: { lat: 45.164417, lon: -1.083483 }, good: ['O', 'SO', 'S'], ok: ['N', 'NO'], level: 'Confirmé' },
  // Lac de Lacanau
  { id: 'lacanau-lac', name: 'Lacanau Lac', area: 'Lac de Lacanau', lat: 44.981246, lon: -1.098291, windPoint: { lat: 44.980405, lon: -1.100349 }, good: ['NO', 'O', 'SO', 'S'], ok: ['N'], level: 'Débutant', note: 'Pas avant 19 h l\'été' },
  // Ocean, north of the Bassin
  // Replaces the table's Lacanau Sud and Super Sud, same orientations and restrictions.
  { id: 'lacanau-ocean', name: 'Lacanau Océan', area: 'Océan nord', lat: 45.000973, lon: -1.202472, windPoint: { lat: 45.003279, lon: -1.206235 }, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert', note: "Interdit l'été" },
  { id: 'le-porge', name: 'Le Porge', area: 'Océan nord', lat: 44.892134, lon: -1.219553, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert', note: 'Panneaux Abeilles' },
  { id: 'grand-crohot', name: 'Le Grand Crohot', area: 'Océan nord', lat: 44.797919, lon: -1.235184, windPoint: { lat: 44.797487, lon: -1.236964 }, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert', note: 'Panneaux Abeilles' },
  // Bassin d'Arcachon
  { id: 'claouey', name: 'Claouey - Bertic', area: "Bassin d'Arcachon", lat: 44.747475, lon: -1.172587, windPoint: { lat: 44.746823, lon: -1.17116 }, good: ['SO', 'S', 'SE', 'E', 'NE'], ok: [], level: 'Confirmé', tide: 2, note: "Interdit l'été" },
  { id: 'aerium', name: "L'Aérium", area: "Bassin d'Arcachon", lat: 44.75506, lon: -1.134345, windPoint: { lat: 44.754918, lon: -1.135271 }, good: ['NO', 'O', 'SO', 'S'], ok: [], level: 'Confirmé', tide: 2, note: 'Orientations à vérifier' },
  { id: 'betey', name: 'Le Betey', area: "Bassin d'Arcachon", lat: 44.733467, lon: -1.092514, windPoint: { lat: 44.732001, lon: -1.093669 }, good: ['NO', 'O', 'SO', 'S', 'SE'], ok: [], level: 'Débutant', tide: 2, note: "Interdit l'été" },
  // Not in the table: orientations copied from Le Betey, its neighbour on the same shore.
  { id: 'taussat', name: 'Taussat', area: "Bassin d'Arcachon", lat: 44.716687, lon: -1.071281, good: ['NO', 'O', 'SO', 'S', 'SE'], ok: [], level: 'Débutant', tide: 2, note: 'Orientations à vérifier' },
  { id: 'la-hume', name: 'La Hume', area: "Bassin d'Arcachon", lat: 44.645325, lon: -1.115474, windPoint: { lat: 44.647832, lon: -1.113052 }, good: ['N', 'NO', 'O', 'E', 'NE'], ok: [], level: 'Débutant', tide: 3, note: 'Période de chasse' },
  { id: 'arbousiers', name: 'Les Arbousiers', area: "Bassin d'Arcachon", lat: 44.64641, lon: -1.200347, windPoint: { lat: 44.647148, lon: -1.200423 }, good: ['N', 'NO', 'O', 'SO'], ok: ['NE'], level: 'Confirmé', note: "Inaccessible l'été" },
  // Ocean, south of the Bassin
  { id: 'lagune-sud', name: 'La Lagune Sud', area: 'Océan sud', lat: 44.548778, lon: -1.249725, windPoint: { lat: 44.549675, lon: -1.250783 }, good: ['N', 'NO', 'O', 'SO'], ok: [], level: 'Expert', note: 'Réserve naturelle' },
  { id: 'la-salie', name: 'La Salie', area: 'Océan sud', lat: 44.521294, lon: -1.255038, windPoint: { lat: 44.521359, lon: -1.260705 }, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert +', note: 'Panneaux Abeilles' },
  { id: 'biscarrosse', name: 'Biscarrosse', area: 'Océan sud', lat: 44.445565, lon: -1.256221, windPoint: { lat: 44.445491, lon: -1.258682 }, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert', note: 'Panneaux Abeilles' },
  // Lac de Cazaux-Sanguinet and Lac de Biscarrosse
  { id: 'laouga', name: 'Laouga', area: 'Lac de Cazaux', lat: 44.520582, lon: -1.176372, windPoint: { lat: 44.519541, lon: -1.175587 }, good: ['S', 'SE', 'E'], ok: [], level: 'Débutant', note: "Interdit l'été" },
  { id: 'estey', name: "Port de l'Estey", area: 'Lac de Cazaux', lat: 44.482797, lon: -1.103575, windPoint: { lat: 44.483944, lon: -1.103947 }, good: ['NO', 'O', 'SO'], ok: ['N'], level: 'Confirmé', note: "Interdit l'été" },
  { id: 'mayotte', name: 'Mayotte', area: 'Lac de Cazaux', lat: 44.439603, lon: -1.160313, windPoint: { lat: 44.440562, lon: -1.162344 }, good: ['N', 'NO', 'O'], ok: [], level: 'Débutant', note: 'Interdit hors été' },
  { id: 'navarrosse', name: 'Navarrosse', area: 'Lac de Cazaux', lat: 44.43483, lon: -1.165677, windPoint: { lat: 44.436076, lon: -1.166859 }, good: ['N', 'NO', 'O'], ok: [], level: 'Débutant', note: "Interdit l'été" },
  { id: 'ispe', name: 'Ispe', area: 'Lac de Biscarrosse', lat: 44.444679, lon: -1.192241, windPoint: { lat: 44.446166, lon: -1.189892 }, good: ['N', 'SE', 'E', 'NE'], ok: [], level: 'Débutant', note: "Interdit l'été" },
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
