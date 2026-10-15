'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Modal = DialogPrimitive.Root

const ModalTrigger = DialogPrimitive.Trigger

const ModalPortal = DialogPrimitive.Portal

const ModalClose = DialogPrimitive.Close

const ModalOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn(
			'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
			className
		)}
		{...props}
	/>
))
ModalOverlay.displayName = DialogPrimitive.Overlay.displayName

const ModalContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
		size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
	}
>(({ className, children, size = 'md', ...props }, ref) => {
	const sizeClasses = {
		sm: 'max-w-md',
		md: 'max-w-lg',
		lg: 'max-w-2xl',
		xl: 'max-w-4xl',
		'2xl': 'max-w-6xl',
		full: 'max-w-[95vw] max-h-[95vh]'
	}

	return (
		<ModalPortal>
			<ModalOverlay />
			<DialogPrimitive.Content
				ref={ref}
				className={cn(
					'fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
					sizeClasses[size],
					size === 'full' && 'h-full overflow-auto',
					className
				)}
				{...props}
			>
				{children}
				<DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
					<X className="h-4 w-4" />
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
			</DialogPrimitive.Content>
		</ModalPortal>
	)
})
ModalContent.displayName = DialogPrimitive.Content.displayName

const ModalHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			'flex flex-col space-y-1.5 text-center sm:text-left',
			className
		)}
		{...props}
	/>
)
ModalHeader.displayName = 'ModalHeader'

const ModalFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
			className
		)}
		{...props}
	/>
)
ModalFooter.displayName = 'ModalFooter'

const ModalTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn(
			'text-lg font-semibold leading-none tracking-tight',
			className
		)}
		{...props}
	/>
))
ModalTitle.displayName = DialogPrimitive.Title.displayName

const ModalDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn('text-sm text-muted-foreground', className)}
		{...props}
	/>
))
ModalDescription.displayName = DialogPrimitive.Description.displayName

// Form Modal Component for complex forms
interface FormModalProps {
	isOpen: boolean
	onClose: () => void
	title: string
	description?: string
	size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
	children: React.ReactNode
	footer?: React.ReactNode
	className?: string
}

export function FormModal({
	isOpen,
	onClose,
	title,
	description,
	size = 'lg',
	children,
	footer,
	className
}: FormModalProps) {
	return (
		<Modal open={isOpen} onOpenChange={onClose}>
			<ModalContent size={size} className={className}>
				<ModalHeader>
					<ModalTitle>{title}</ModalTitle>
					{description && (
						<ModalDescription>{description}</ModalDescription>
					)}
				</ModalHeader>
				<div className="max-h-[75vh] overflow-y-auto overscroll-contain">
					{children}
				</div>
				{footer && <ModalFooter>{footer}</ModalFooter>}
			</ModalContent>
		</Modal>
	)
}

// Confirmation Modal Component
interface ConfirmationModalProps {
	isOpen: boolean
	onClose: () => void
	onConfirm: () => void
	title: string
	description: string
	confirmText?: string
	cancelText?: string
	variant?: 'default' | 'destructive'
}

export function ConfirmationModal({
	isOpen,
	onClose,
	onConfirm,
	title,
	description,
	confirmText = 'Confirm',
	cancelText = 'Cancel',
	variant = 'default'
}: ConfirmationModalProps) {
	const handleConfirm = () => {
		onConfirm()
		onClose()
	}

	return (
		<Modal open={isOpen} onOpenChange={onClose}>
			<ModalContent size="sm">
				<ModalHeader>
					<ModalTitle>{title}</ModalTitle>
					<ModalDescription>{description}</ModalDescription>
				</ModalHeader>
				<ModalFooter>
					<button
						onClick={onClose}
						className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
					>
						{cancelText}
					</button>
					<button
						onClick={handleConfirm}
						className={cn(
							'px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2',
							variant === 'destructive'
								? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
								: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
						)}
					>
						{confirmText}
					</button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

export {
	Modal,
	ModalPortal,
	ModalOverlay,
	ModalClose,
	ModalTrigger,
	ModalContent,
	ModalHeader,
	ModalFooter,
	ModalTitle,
	ModalDescription,
} 