import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { Icon, type IconName } from './Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'destructive'

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-[transform,opacity] duration-150 ' +
  'active:scale-[0.98] active:opacity-85 disabled:pointer-events-none disabled:opacity-40'

const VARIANTS: Record<ButtonVariant, string> = {
  // The one primary action per screen: 52 tall, full width on phones.
  primary: 'min-h-[52px] bg-accent px-5 text-body text-on-accent',
  secondary: 'min-h-11 bg-accent-soft px-4 text-body text-accent',
  plain: 'min-h-11 px-2 text-body text-accent',
  destructive: 'min-h-11 bg-danger/12 px-4 text-body text-danger',
}

export function buttonClass(variant: ButtonVariant = 'primary', block = false, extra = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${block ? 'w-full' : ''} ${extra}`.trim()
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  block?: boolean
  icon?: IconName
  children: ReactNode
}

export function Button({ variant = 'primary', block = false, icon, className = '', type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, block, className)} {...rest}>
      {icon && <Icon name={icon} size={20} />}
      {children}
    </button>
  )
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  block?: boolean
  icon?: IconName
}

export function ButtonLink({ variant = 'primary', block = false, icon, className = '', children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, block, typeof className === 'string' ? className : '')} {...rest}>
      {icon && <Icon name={icon} size={20} />}
      {children}
    </Link>
  )
}
