import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState } from '../components/ui/EmptyState'

export default function Calendar() {
  return (
    <main className="screen">
      <ScreenHeader title="Calendar" />
      <EmptyState icon="📅" title="Calendar coming up" hint="Month, week and day views with tasks, dates and blocks in one grid." />
    </main>
  )
}
