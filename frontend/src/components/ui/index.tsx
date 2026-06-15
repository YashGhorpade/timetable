import React from "react";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "framer-motion";

// ─── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}
export const Button: React.FC<ButtonProps> = ({
  variant = "primary", size = "md", loading, icon, children, className, disabled, ...props
}) => {
  const base = "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary:   "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-sm",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 focus:ring-slate-400 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600",
    ghost:     "text-slate-600 hover:bg-slate-100 focus:ring-slate-300 dark:text-slate-300 dark:hover:bg-slate-800",
    danger:    "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-sm",
    success:   "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 shadow-sm",
  };
  const sizes = {
    xs: "text-xs px-2.5 py-1.5",
    sm: "text-sm px-3 py-2",
    md: "text-sm px-4 py-2.5",
    lg: "text-base px-5 py-3",
  };
  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  );
};

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps { children: React.ReactNode; className?: string; padding?: boolean }
export const Card: React.FC<CardProps> = ({ children, className, padding = true }) => (
  <div className={clsx(
    "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card",
    padding && "p-5",
    className
  )}>
    {children}
  </div>
);

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = "blue" | "green" | "red" | "yellow" | "purple" | "slate" | "orange";
const BADGE_STYLES: Record<BadgeVariant, string> = {
  blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  green:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  red:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  purple: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  slate:  "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};
export const Badge: React.FC<{ variant?: BadgeVariant; children: React.ReactNode; className?: string }> = ({
  variant = "slate", children, className
}) => (
  <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", BADGE_STYLES[variant], className)}>
    {children}
  </span>
);

// ─── Spinner ──────────────────────────────────────────────────────────────────
export const Spinner: React.FC<{ size?: "sm" | "md" | "lg"; className?: string }> = ({
  size = "md", className
}) => {
  const s = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" };
  return (
    <div className={clsx("border-2 border-current border-t-transparent rounded-full animate-spin", s[size], className)} />
  );
};

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}
export const Input: React.FC<InputProps> = ({ label, error, hint, icon, className, id, ...props }) => {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>}
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>}
        <input
          id={inputId}
          className={clsx(
            "w-full rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100",
            "placeholder:text-slate-400 transition-colors text-sm py-2.5",
            icon ? "pl-9 pr-3" : "px-3",
            error
              ? "border-red-400 focus:ring-red-400"
              : "border-slate-300 dark:border-slate-600 focus:border-blue-400 focus:ring-blue-400",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            className,
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
};

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}
export const Select: React.FC<SelectProps> = ({ label, error, options, placeholder, className, id, ...props }) => {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={selectId} className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>}
      <select
        id={selectId}
        className={clsx(
          "w-full rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm py-2.5 px-3",
          "focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors",
          error
            ? "border-red-400 focus:ring-red-400"
            : "border-slate-300 dark:border-slate-600 focus:border-blue-400 focus:ring-blue-400",
          className,
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: React.ReactNode;
}
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, size = "md", footer }) => {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className={clsx(
              "relative w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden",
              widths[size],
            )}
          >
            {title && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="font-semibold text-slate-900 dark:text-white text-base">{title}</h2>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            )}
            <div className="px-6 py-5">{children}</div>
            {footer && (
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ─── Toast notification (minimal) ─────────────────────────────────────────────
type ToastType = "success" | "error" | "info" | "warning";
interface ToastProps { message: string; type?: ToastType; onDismiss: () => void }
const TOAST_STYLES: Record<ToastType, string> = {
  success: "bg-emerald-600",
  error:   "bg-red-600",
  info:    "bg-blue-600",
  warning: "bg-amber-500",
};
export const Toast: React.FC<ToastProps> = ({ message, type = "info", onDismiss }) => (
  <motion.div
    initial={{ opacity: 0, y: 20, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 20, scale: 0.95 }}
    className={clsx("flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg min-w-[240px]", TOAST_STYLES[type])}
  >
    <span className="flex-1">{message}</span>
    <button onClick={onDismiss} className="opacity-80 hover:opacity-100 transition-opacity">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>
  </motion.div>
);

// ─── Stat card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string; value: string | number;
  icon?: React.ReactNode; trend?: string; color?: string;
}
export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, trend, color = "blue" }) => {
  const colors: Record<string, string> = {
    blue:   "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    green:  "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
    purple: "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400",
    orange: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",
  };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
          {trend && <p className="text-xs text-slate-400 mt-1">{trend}</p>}
        </div>
        {icon && (
          <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", colors[color] ?? colors.blue)}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

// ─── Empty state ─────────────────────────────────────────────────────────────
export const EmptyState: React.FC<{ title: string; description?: string; action?: React.ReactNode }> = ({
  title, description, action
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
      <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.01M6 12h.01M6 18h.01M12 6h.01M12 12h.01M12 18h.01M18 6h.01M18 12h.01M18 18h.01"/>
      </svg>
    </div>
    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
    {description && <p className="text-sm text-slate-400 mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// ─── Table ────────────────────────────────────────────────────────────────────
interface Column<T> { key: string; header: string; render?: (row: T) => React.ReactNode; width?: string }
interface TableProps<T> { columns: Column<T>[]; data: T[]; onRowClick?: (row: T) => void; loading?: boolean }
export function Table<T extends { id: string }>({ columns, data, onRowClick, loading }: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ width: col.width }} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {loading ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center"><Spinner className="mx-auto" /></td></tr>
          ) : data.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400 text-sm">No records found.</td></tr>
          ) : data.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={clsx("transition-colors", onRowClick && "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40")}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {col.render ? col.render(row) : String((row as any)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page header ─────────────────────────────────────────────────────────────
export const PageHeader: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode }> = ({
  title, subtitle, actions
}) => (
  <div className="flex items-start justify-between mb-6">
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);
