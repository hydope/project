import { motion } from '../lib/motion';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export default function Toast({ children, type = 'info', onClose }) {
  const Icon = icons[type] || Info;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.34, 1.2, 0.64, 1] }}
      className={`toast toast-${type}`}
      role="alert"
    >
      <Icon
        className="toast-icon w-[18px] h-[18px]"
        style={{
          color:
            type === 'success' ? 'var(--success)' :
            type === 'error' ? 'var(--danger)' :
            type === 'warning' ? 'var(--warning)' :
            'var(--accent)',
        }}
      />
      <div className="toast-content">{children}</div>
      <button className="toast-action" onClick={onClose} aria-label="Close toast">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}