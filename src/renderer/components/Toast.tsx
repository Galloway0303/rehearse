import { useAppStore } from '../../shared/store'

export default function Toast() {
  const toast = useAppStore((s) => s.toast)
  if (!toast) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-slide-up">
      <div className="rounded-full bg-ink-700 border border-amber-glow/30 px-5 py-2.5 text-sm text-mist-100 shadow-glow">
        {toast}
      </div>
    </div>
  )
}
