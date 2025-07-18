import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { NextApiRequest } from 'next'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getClientIP(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  const ip = forwarded ? (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0]) : req.socket?.remoteAddress
  return ip || '127.0.0.1'
}

export function getUserIdentifier(req: NextApiRequest): string {
  // Priority order: user email, user ID, IP address
  const userEmail = req.headers['x-user-email'] as string || req.body?.userEmail
  const userId = req.headers['x-user-id'] as string || req.body?.userId
  const ip = getClientIP(req)
  
  return userEmail || userId || ip
}