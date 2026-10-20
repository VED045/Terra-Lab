'use client';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useStudio } from '@/lib/store';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const variants = cva('button', {
  variants: {
    variant: {
      default: 'button-primary',
      outline: 'button-outline',
      ghost: 'button-ghost',
      danger: 'button-danger',
    },
    size: { default: '', icon: 'button-icon', sm: 'button-sm' },
  },
  defaultVariants: { variant: 'outline', size: 'default' },
});
export function Button({
  className,
  variant,
  size,
  asChild = false,
  help,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof variants> & { asChild?: boolean; help?: string }) {
  const theme = useStudio((s) => s.project.canvas.theme);
  const id = React.useId();
  const Comp = asChild ? Slot : 'button';
  const button = (
    <Comp
      className={cn(variants({ variant, size, className }))}
      {...props}
      aria-describedby={
        [props['aria-describedby'], help ? id : undefined].filter(Boolean).join(' ') || undefined
      }
    />
  );
  if (!help) return button;
  return (
    <>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          {props.disabled ? (
            <span className="action-help-target" tabIndex={0} aria-label={help}>
              {button}
            </span>
          ) : (
            button
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className={`tooltip theme-${theme}`} side="top" sideOffset={8}>
            {help}
            <Tooltip.Arrow />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <span id={id} className="sr-only">
        {help}
      </span>
    </>
  );
}
