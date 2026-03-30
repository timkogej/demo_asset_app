import Modal from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: string;
  t: (key: string) => string;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  message,
  t,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('common.confirm')} maxWidth="max-w-sm">
      <p className="text-sm text-text-dark mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="btn-secondary">
          {t('btn.cancel')}
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="btn-danger"
        >
          {t('btn.delete')}
        </button>
      </div>
    </Modal>
  );
}
