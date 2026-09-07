import type { ReactNode } from 'react'

type Props = {
  title: string
  hint?: ReactNode
  children: ReactNode
  busy?: boolean
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Shared admin import preview panel (`adminImport` kind).
 * Wraps metadata tables before bulk create+upload.
 */
export function AdminImportPreview({
  title,
  hint,
  children,
  busy,
  confirmLabel,
  cancelLabel = 'Hủy preview',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="admin-preview-panel">
      <h3 className="admin-preview-panel__title">{title}</h3>
      {hint ? <div className="admin-preview-panel__hint">{hint}</div> : null}
      <div className="admin-preview-panel__body">{children}</div>
      <div className="admin-actions admin-preview-panel__actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
          {busy ? 'Đang xử lý…' : confirmLabel}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}
