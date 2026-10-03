import {Dialog} from 'radix-ui';
import {X} from 'lucide-react';
import type {ReactElement, ReactNode} from 'react';
import {Button} from './button';

export function Modal({title, description, trigger, children, open, onOpenChange, sheet = false}: {
  title: string; description: string; trigger: ReactElement; children: ReactNode;
  open: boolean; onOpenChange: (open: boolean) => void; sheet?: boolean;
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="shop-overlay"/>
      <Dialog.Content className={`shop-dialog${sheet ? ' shop-sheet' : ''}`}>
        <Dialog.Title className="shop-dialog-title">{title}</Dialog.Title>
        <Dialog.Description className="shop-muted">{description}</Dialog.Description>
        {children}
        <Dialog.Close asChild><Button variant="icon" className="shop-dialog-close" aria-label="Close dialog"><X size={20}/></Button></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
