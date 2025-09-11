import * as React from 'react'

import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from './ui/card'

type PageCardProps = {
  title: string
  children: React.ReactNode
  contentClassName?: string
  titleClassName?: string
  containerClassName?: string
  titleAs?: React.ElementType
}

export function PageCard({
  title,
  children,
  contentClassName = '',
  titleClassName = '',
  containerClassName,
  titleAs = 'h2',
}: PageCardProps) {
  const TitleTag = titleAs
  
  // Get appropriate font size class based on heading level
  const getDefaultTitleClasses = (tagName: React.ElementType) => {
    if (typeof tagName === 'string') {
      switch (tagName) {
        case 'h1': return 'text-xl font-semibold leading-none tracking-tight'
        case 'h2': return 'text-lg font-semibold leading-none tracking-tight'
        case 'h3': return 'text-base font-semibold leading-none tracking-tight'
        default: return 'font-semibold leading-none tracking-tight'
      }
    }
    return 'font-semibold leading-none tracking-tight'
  }
  
  return (
    <div className={cn('mx-auto max-w-md px-4 py-8 pointer-events-auto', containerClassName)}>
      <Card>
        <CardHeader>
          <TitleTag className={cn(getDefaultTitleClasses(titleAs), titleClassName)}>
            {title}
          </TitleTag>
        </CardHeader>
        <CardContent className={cn(contentClassName)}>
          {children}
        </CardContent>
      </Card>
    </div>
  )
}


