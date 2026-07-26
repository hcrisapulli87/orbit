import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState } from '../components/ui/EmptyState'

export default function Habits() {
  return (
    <main className="screen">
      <ScreenHeader title="Habits" />
      <EmptyState icon="🔁" title="Habits coming up" hint="Streaks count consecutive scheduled days, so a Mon/Wed/Fri habit isn't broken by Tuesday." />
    </main>
  )
}
