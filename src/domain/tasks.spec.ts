import { describe, expect, it } from 'vitest'
import { generateDailyTasks, TaskBoard } from './tasks'
import { freshSystems } from './shipState'

describe('daily tasks', () => {
  it('generates the routine set deterministically', () => {
    const sys = freshSystems()
    const a = generateDailyTasks(3, sys)
    const b = generateDailyTasks(3, sys)
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id))
    expect(a.length).toBeGreaterThanOrEqual(6)
    expect(a.some((t) => t.id.startsWith('d3-'))).toBe(true)
  })

  it('adds repair tasks for broken systems only once', () => {
    const sys = freshSystems()
    sys.wingDamaged = true
    sys.hullPuncture = true
    const list = generateDailyTasks(1, sys)
    const ids = list.filter((t) => t.tag === 'repair').map((t) => t.id)
    expect(ids).toContain('repair-wing')
    expect(ids).toContain('repair-hull')
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('TaskBoard', () => {
  it('completes idempotently', () => {
    const board = new TaskBoard()
    board.load(generateDailyTasks(2, freshSystems()))
    expect(board.complete('d2-exercise')).toBe(true)
    expect(board.complete('d2-exercise')).toBe(false)
    expect(board.isDone('d2-exercise')).toBe(true)
  })

  it('add does not duplicate', () => {
    const board = new TaskBoard()
    const sys = freshSystems()
    sys.wingDamaged = true
    board.load(generateDailyTasks(1, sys))
    board.add({ id: 'repair-wing', title: 'x', detail: '', done: false, tag: 'repair' })
    expect(board.tasks.filter((t) => t.id === 'repair-wing').length).toBe(1)
  })
})
