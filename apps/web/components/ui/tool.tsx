'use client';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Button } from './button';
import { useStudio } from '@/lib/store';
export function Tool({
  label,
  children,
  active,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const theme = useStudio((s) => s.project.canvas.theme);
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          aria-pressed={active}
          className={active ? 'active' : ''}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={`tooltip theme-${theme}`} sideOffset={8}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
