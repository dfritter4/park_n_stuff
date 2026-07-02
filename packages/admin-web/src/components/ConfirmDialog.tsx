interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal modal-confirm" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </button>
          <button type="button" className="danger-button" onClick={onConfirm} disabled={isConfirming}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
