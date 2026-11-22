import type { ReactNode } from 'react'
import type { SyncSummary } from '../game/sync'
import { CopyButton } from '../ui/bits'

/**
 * Что есть только в этом браузере. Запись одна на весь сайт: покупки, награды, знаки, город и колода вместе,
 * поэтому скопировать её можно с любой вкладки, а Claude Code переносит её одной командой (record.mjs sync).
 * plain — без рамки карточки, когда заметка стоит внутри другой карточки; children — кнопки рядом с копированием.
 */
export function SyncNote({ sync, plain, children }: { sync: SyncSummary; plain?: boolean; children?: ReactNode }) {
  if (sync.count === 0) return null
  return (
    <div className={plain ? 'sync-note' : 'card sync-note'}>
      <p>
        <b>Только в этом браузере:</b> {sync.parts.join(', ')}. Чтобы это было на всех устройствах, отдай запись репетитору — он
        перенесёт всё в репозиторий одной командой.
      </p>
      <div className="act-row">
        <CopyButton text={sync.record} label="Скопировать запись" />
        {children}
      </div>
    </div>
  )
}
