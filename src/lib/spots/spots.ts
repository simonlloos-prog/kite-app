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
}

/**
 * Spots, orientations, levels and restrictions from the "Trouve ton spot autour de Bordeaux"
 * table (KitesurfBordeaux.com, updated 06/07/2018), plus L'Aérium. Positions come from the
 * table's addresses (OSM Nominatim): street level, to be moved onto the beach where needed.
 * L'Aérium is not in the table: its orientations are a guess, to be checked.
 */
export const SPOTS: Spot[] = [
  // Gironde estuary
  { id: 'bonne-anse', name: 'Bonne Anse', area: 'Estuaire', lat: 45.6927, lon: -1.1883, good: ['NO', 'O', 'SO', 'S', 'SE'], ok: [], level: 'Débutant' },
  { id: 'chambrette', name: 'La Chambrette', area: 'Estuaire', lat: 45.5467, lon: -1.0549, good: ['N', 'SE', 'E', 'NE'], ok: [], level: 'Confirmé' },
  // Lac d'Hourtin
  { id: 'hourtin-port', name: 'Hourtin Port', area: "Lac d'Hourtin", lat: 45.1846, lon: -1.0639, good: ['O', 'SO', 'S'], ok: ['N', 'NO'], level: 'Débutant' },
  { id: 'lachanau', name: 'Lachanau', area: "Lac d'Hourtin", lat: 45.1648, lon: -1.0713, good: ['O', 'SO', 'S'], ok: ['N', 'NO'], level: 'Confirmé' },
  // Lac de Lacanau
  { id: 'lacanau-lac', name: 'Lacanau Lac', area: 'Lac de Lacanau', lat: 44.9806, lon: -1.0956, good: ['NO', 'O', 'SO', 'S'], ok: ['N'], level: 'Débutant', note: 'Pas avant 19 h l\'été' },
  // Ocean, north of the Bassin
  { id: 'lacanau-sud', name: 'Lacanau Sud', area: 'Océan nord', lat: 44.9944, lon: -1.1993, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert', note: "Interdit l'été" },
  { id: 'super-sud', name: 'Super Sud', area: 'Océan nord', lat: 44.9942, lon: -1.1982, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert', note: 'Panneaux Abeilles' },
  { id: 'le-porge', name: 'Le Porge', area: 'Océan nord', lat: 44.8843, lon: -1.1682, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert', note: 'Panneaux Abeilles' },
  { id: 'grand-crohot', name: 'Le Grand Crohot', area: 'Océan nord', lat: 44.795, lon: -1.235, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert', note: 'Panneaux Abeilles' },
  // Bassin d'Arcachon
  { id: 'claouey', name: 'Claouey - Bertic', area: "Bassin d'Arcachon", lat: 44.7478, lon: -1.1771, good: ['SO', 'S', 'SE', 'E', 'NE'], ok: [], level: 'Confirmé', note: "Interdit l'été" },
  { id: 'aerium', name: "L'Aérium", area: "Bassin d'Arcachon", lat: 44.7629, lon: -1.1328, good: ['NO', 'O', 'SO', 'S'], ok: [], level: 'Confirmé', note: 'Orientations à vérifier' },
  { id: 'betey', name: 'Le Betey', area: "Bassin d'Arcachon", lat: 44.7326, lon: -1.09, good: ['NO', 'O', 'SO', 'S', 'SE'], ok: [], level: 'Débutant', note: "Interdit l'été" },
  { id: 'la-hume', name: 'La Hume', area: "Bassin d'Arcachon", lat: 44.6442, lon: -1.1137, good: ['N', 'NO', 'O', 'E', 'NE'], ok: [], level: 'Débutant', note: 'Période de chasse' },
  { id: 'arbousiers', name: 'Les Arbousiers', area: "Bassin d'Arcachon", lat: 44.6451, lon: -1.1979, good: ['N', 'NO', 'O', 'SO'], ok: ['NE'], level: 'Confirmé', note: "Inaccessible l'été" },
  // Ocean, south of the Bassin
  { id: 'lagune-sud', name: 'La Lagune Sud', area: 'Océan sud', lat: 44.5469, lon: -1.2499, good: ['N', 'NO', 'O', 'SO'], ok: [], level: 'Expert', note: 'Réserve naturelle' },
  { id: 'la-salie', name: 'La Salie', area: 'Océan sud', lat: 44.5292, lon: -1.2563, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert +', note: 'Panneaux Abeilles' },
  { id: 'biscarrosse', name: 'Biscarrosse', area: 'Océan sud', lat: 44.4417, lon: -1.2526, good: ['N', 'NO', 'SO'], ok: ['O'], level: 'Expert', note: 'Panneaux Abeilles' },
  // Lac de Cazaux-Sanguinet and Lac de Biscarrosse
  { id: 'laouga', name: 'Laouga', area: 'Lac de Cazaux', lat: 44.5219, lon: -1.1782, good: ['S', 'SE', 'E'], ok: [], level: 'Débutant', note: "Interdit l'été" },
  { id: 'aigrettes', name: 'Les Aigrettes', area: 'Lac de Cazaux', lat: 44.4992, lon: -1.0877, good: ['O', 'SO', 'S'], ok: [], level: 'Débutant', note: 'Interdit' },
  { id: 'estey', name: "Port de l'Estey", area: 'Lac de Cazaux', lat: 44.4823, lon: -1.1019, good: ['NO', 'O', 'SO'], ok: ['N'], level: 'Confirmé', note: "Interdit l'été" },
  { id: 'mayotte', name: 'Mayotte', area: 'Lac de Cazaux', lat: 44.4345, lon: -1.1518, good: ['N', 'NO', 'O'], ok: [], level: 'Débutant', note: 'Interdit hors été' },
  { id: 'navarrosse', name: 'Navarrosse', area: 'Lac de Cazaux', lat: 44.4317, lon: -1.1777, good: ['N', 'NO', 'O'], ok: [], level: 'Débutant', note: "Interdit l'été" },
  { id: 'ispe', name: 'Ispe', area: 'Lac de Biscarrosse', lat: 44.4446, lon: -1.195, good: ['N', 'SE', 'E', 'NE'], ok: [], level: 'Débutant', note: "Interdit l'été" },
]

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
