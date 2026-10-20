'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useStudio } from '@/lib/store';
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  className = '',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const theme = useStudio((s) => s.project.canvas.theme);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={`dialog-content theme-${theme} ${wide ? 'dialog-wide' : ''} ${className}`}
        >
          <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="dialog-description">
            {description ?? 'Configure your TerraLab workspace.'}
          </DialogPrimitive.Description>
          <DialogPrimitive.Close className="dialog-close" aria-label="Close dialog">
            <X size={18} />
          </DialogPrimitive.Close>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
