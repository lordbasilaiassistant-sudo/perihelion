export interface Alert {
  id: string
  text: string
  level: 'info' | 'warn' | 'crit'
}

export const BATTERY_CAP_KWH = 12
export const SOLAR_KW_HEALTHY = 1.65
export const BASE_DRAW_KW = 0.92

export interface ShipSystems {
  powerKWh: number
  wingDamaged: boolean
  o2Percent: number
  co2Percent: number
  pressureKPa: number
  waterLiters: number
  foodKcal: number
  radiationMSv: number
  stormActive: boolean
  scrubberIntegrity: number
  scrubberFilterWear: number
  recyclerIntegrity: number
  scrubbersOnline: boolean
  hullPuncture: boolean
  exerciseMinutesToday: number
}

export function freshSystems(): ShipSystems {
  return {
    powerKWh: BATTERY_CAP_KWH * 0.82,
    wingDamaged: false,
    o2Percent: 20.7,
    co2Percent: 0.09,
    pressureKPa: 101.3,
    waterLiters: 84,
    foodKcal: 5200,
    radiationMSv: 0.4,
    stormActive: false,
    scrubberIntegrity: 96,
    scrubberFilterWear: 0.08,
    recyclerIntegrity: 91,
    scrubbersOnline: true,
    hullPuncture: false,
    exerciseMinutesToday: 0
  }
}

function clampf(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function tickSystems(s: ShipSystems, dt: number): void {
  const genKW = s.wingDamaged ? SOLAR_KW_HEALTHY * 0.42 : SOLAR_KW_HEALTHY
  const drawKW = BASE_DRAW_KW + (s.scrubbersOnline ? 0.18 : 0) + 0.05
  const netKW = genKW - drawKW
  s.powerKWh = clampf(s.powerKWh + (netKW * dt) / 3600, 0, BATTERY_CAP_KWH)
  const powered = s.powerKWh > 0.05

  const eff = clampf((s.scrubberIntegrity / 100) * (1 - s.scrubberFilterWear), 0, 1)
  const rise = 0.000105
  const scrubCap = powered && s.scrubbersOnline ? 0.00013 * eff : 0
  s.co2Percent = Math.max(0.03, s.co2Percent + (rise - Math.min(rise, scrubCap)) * dt)

  if (powered) {
    s.o2Percent += (20.9 - s.o2Percent) * 0.0009 * dt
  } else {
    s.o2Percent -= 0.0045 * dt
  }
  if (s.o2Percent < 12) s.o2Percent = 12

  if (s.hullPuncture) {
    s.pressureKPa = Math.max(28, s.pressureKPa - 0.85 * dt)
    s.o2Percent = Math.max(12, s.o2Percent - 0.018 * dt)
  } else {
    s.pressureKPa += (101.3 - s.pressureKPa) * 0.0022 * dt
  }

  const recycleFactor = s.recyclerIntegrity < 50 ? 2.2 : 1
  s.waterLiters = Math.max(0, s.waterLiters - 0.000045 * recycleFactor * dt)
  s.foodKcal = Math.max(0, s.foodKcal - 0.029 * dt)
  s.radiationMSv += 3e-6 * (s.stormActive ? 45 : 1) * dt
  s.scrubberFilterWear = clampf(s.scrubberFilterWear + 0.0000019 * dt, 0, 1)
  s.scrubberIntegrity = Math.max(10, s.scrubberIntegrity - 0.000008 * dt)
}

export function alertsOf(s: ShipSystems): Alert[] {
  const out: Alert[] = []
  if (s.hullPuncture) out.push({ id: 'hull', text: 'HULL BREACH — PRESSURE FALLING', level: 'crit' })
  if (s.co2Percent > 3.2) out.push({ id: 'co2c', text: 'CO2 CRITICAL', level: 'crit' })
  else if (s.co2Percent > 0.7) out.push({ id: 'co2w', text: 'CO2 ELEVATED', level: 'warn' })
  if (s.o2Percent < 17) out.push({ id: 'o2', text: 'O2 LOW', level: 'crit' })
  else if (s.o2Percent < 19.4) out.push({ id: 'o2w', text: 'O2 below nominal', level: 'warn' })
  if (s.powerKWh <= 0.05) out.push({ id: 'pwr0', text: 'POWER DEPLETED', level: 'crit' })
  else if (s.powerKWh < BATTERY_CAP_KWH * 0.15) out.push({ id: 'pwrl', text: 'Battery low', level: 'warn' })
  if (s.pressureKPa < 55) out.push({ id: 'press', text: 'PRESSURE LOW', level: 'crit' })
  if (s.waterLiters < 10) out.push({ id: 'h2o', text: 'Water reserves critical', level: 'crit' })
  else if (s.waterLiters < 25) out.push({ id: 'h2ow', text: 'Water reserves low', level: 'warn' })
  if (s.foodKcal < 500) out.push({ id: 'food', text: 'Food stores critical', level: 'crit' })
  else if (s.foodKcal < 1400) out.push({ id: 'foodw', text: 'Food stores low', level: 'warn' })
  if (s.wingDamaged) out.push({ id: 'wing', text: 'Port solar wing damaged — output reduced', level: 'warn' })
  if (s.scrubberFilterWear > 0.5) out.push({ id: 'filter', text: 'Scrubber filter saturated', level: 'warn' })
  if (s.recyclerIntegrity < 70) out.push({ id: 'recyc', text: 'Water recycler degraded', level: 'warn' })
  if (s.stormActive) out.push({ id: 'storm', text: 'SOLAR STORM — radiation rising', level: 'warn' })
  if (!s.scrubbersOnline) out.push({ id: 'scrboff', text: 'Scrubber breakers OPEN', level: 'warn' })
  return out
}

export function hasCritical(s: ShipSystems): boolean {
  return alertsOf(s).some((a) => a.level === 'crit')
}

export const systemActions = {
  meteorHitWing(s: ShipSystems): void {
    s.wingDamaged = true
  },
  fixWing(s: ShipSystems): void {
    s.wingDamaged = false
  },
  clogFilter(s: ShipSystems): void {
    s.scrubberFilterWear = clampf(Math.max(s.scrubberFilterWear + 0.38, 0.62), 0, 1)
  },
  replaceFilter(s: ShipSystems): void {
    s.scrubberFilterWear = 0.02
    s.scrubberIntegrity = Math.min(100, s.scrubberIntegrity + 20)
  },
  powerSurge(s: ShipSystems): void {
    s.powerKWh = Math.max(0, s.powerKWh * 0.62)
  },
  pumpClog(s: ShipSystems): void {
    s.recyclerIntegrity = Math.max(15, s.recyclerIntegrity - 38)
  },
  flushRecycler(s: ShipSystems): void {
    s.recyclerIntegrity = Math.min(100, s.recyclerIntegrity + 45)
  },
  microPuncture(s: ShipSystems): void {
    s.hullPuncture = true
  },
  sealHull(s: ShipSystems): void {
    s.hullPuncture = false
    s.pressureKPa = Math.max(s.pressureKPa, 70)
  }
}

export function dailyReset(s: ShipSystems, rng01: number): void {
  s.exerciseMinutesToday = 0
  s.scrubberFilterWear = clampf(s.scrubberFilterWear + rng01 * 0.03, 0, 1)
  s.stormActive = false
}

export function serializeSystems(s: ShipSystems): Record<string, unknown> {
  return { ...s }
}

export function hydrateSystems(raw: Partial<ShipSystems> | undefined): ShipSystems {
  const base = freshSystems()
  if (!raw) return base
  return { ...base, ...raw }
}
