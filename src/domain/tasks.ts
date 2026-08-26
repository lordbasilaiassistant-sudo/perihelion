import type { ShipSystems } from './shipState'

export type TaskTag = 'routine' | 'repair'

export interface Task {
  id: string
  title: string
  detail: string
  done: boolean
  tag: TaskTag
}

function mk(id: string, title: string, detail: string, tag: TaskTag): Task {
  return { id, title, detail, done: false, tag }
}

export function generateDailyTasks(day: number, sys: ShipSystems): Task[] {
  const list: Task[] = [
    mk(`d${day}-scrubber`, 'Inspect CO2 scrubber', 'Check filters and airflow at the scrubber unit.', 'routine'),
    mk(`d${day}-power`, 'Check power systems', 'Verify battery charge and solar intake at the breaker panel.', 'routine'),
    mk(`d${day}-water`, 'Check water recycler', 'Confirm clean output flow at the recycler.', 'routine'),
    mk(`d${day}-garden`, 'Tend the hydroponic garden', 'Water racks and harvest anything ripe.', 'routine'),
    mk(`d${day}-exercise`, 'Exercise session', 'Resistance treadmill — fight the atrophy.', 'routine'),
    mk(`d${day}-log`, 'Log entry', 'Record the day at the command console.', 'routine')
  ]
  if (sys.wingDamaged) {
    list.push(mk('repair-wing', 'EVA: repair solar wing', 'Suit up, grab the toolkit, restore the damaged string.', 'repair'))
  }
  if (sys.hullPuncture) {
    list.push(mk('repair-hull', 'Seal hull breach', 'Trace the whistle, apply sealant.', 'repair'))
  }
  if (sys.scrubberFilterWear > 0.5) {
    list.push(mk('repair-filter', 'Replace scrubber filter', 'Swap a fresh filter from the workshop shelf.', 'repair'))
  }
  if (sys.recyclerIntegrity < 70) {
    list.push(mk('repair-recycler', 'Flush recycler lines', 'Purge sediment from the water loop.', 'repair'))
  }
  return list
}

export class TaskBoard {
  tasks: Task[] = []

  load(list: Task[]): void {
    this.tasks = list
  }

  add(task: Task): void {
    if (!this.tasks.some((t) => t.id === task.id)) this.tasks.push(task)
  }

  complete(id: string): boolean {
    const t = this.tasks.find((x) => x.id === id)
    if (!t || t.done) return false
    t.done = true
    return true
  }

  completeAll(): void {
    for (const t of this.tasks) t.done = true
  }

  remainingByTag(tag: TaskTag): number {
    return this.tasks.filter((t) => t.tag === tag && !t.done).length
  }

  isDone(id: string): boolean {
    const t = this.tasks.find((x) => x.id === id)
    return !!t && t.done
  }

  allDone(): boolean {
    return this.tasks.every((t) => t.done)
  }

  serialize(): Task[] {
    return this.tasks.map((t) => ({ ...t }))
  }
}
