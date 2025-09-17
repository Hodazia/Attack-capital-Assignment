
"use client"

import { toast as sonnerToast } from "sonner"

type ToastVariant = "default" | "destructive" | "success" | "info"

export interface ToastProps {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

export function useToast() {
  const toast = ({ title, description, variant, duration = 4000 }: ToastProps) => {
    sonnerToast(title, {
      description,
      duration,
      className:
        variant === "destructive"
          ? "bg-red-50 border-red-500 text-red-600"
          : variant === "success"
          ? "bg-green-50 border-green-500 text-green-600"
          : variant === "info"
          ? "bg-blue-50 border-blue-500 text-blue-600"
          : "",
    })
  }

  return { toast }
}
