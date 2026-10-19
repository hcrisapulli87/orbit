import { useCallback } from 'react'
import { busySlices, useData } from './DataProvider'
import { parseTimeToMinutes, weekdayOf } from '../domain/day'
import type { ISODate } from '../domain/day'
import { freeMinutes } from '../domain/planner'

/**
 * How much task time a day really has: the smaller of the weekday's budget in
 * Settings and what that day's meetings leave free between the start and end
 * of the day. One definition, so Today, the wrap-up and the weekly review
 * can't disagree about whether Thursday is full.
 */
export function useDayCapacity() {
  const { settings, calendarSlices } = useData()
  return useCallback(
    (day: ISODate): { capacityMin: number; meetingMin: number } => {
      const dayStart = parseTimeToMinutes(settings.day_start) ?? 480
      const dayEnd = parseTimeToMinutes(settings.day_end) ?? 1260
      const free = freeMinutes(dayStart, dayEnd, busySlices(calendarSlices, day))
      const budget = settings.weekday_capacity[weekdayOf(day)] ?? 180
      return { capacityMin: Math.min(budget, free), meetingMin: dayEnd - dayStart - free }
    },
    [settings, calendarSlices],
  )
}
