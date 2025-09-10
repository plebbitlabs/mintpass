import * as React from 'react'

import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

type PageCardProps = {
  title: string
  children: React.ReactNode
  contentClassName?: string
  titleClassName?: string
}

export function PageCard({ title, children, contentClassName, titleClassName }: PageCardProps) {
  return (
    <div className="mx-auto max-w-md px-4 py-8 pointer-events-auto">
      <Card>
        <CardHeader>
          <CardTitle className={cn(titleClassName)}>{title}</CardTitle>
        </CardHeader>
        <CardContent className={cn(contentClassName)}>
          {children}
        </CardContent>
      </Card>
    </div>
  )
}


