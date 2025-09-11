import * as React from 'react'

import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from './ui/card'

type PageCardProps = {
  title: string
  children: React.ReactNode
  contentClassName?: string
  titleClassName?: string
  containerClassName?: string
  titleAs?: keyof JSX.IntrinsicElements
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
  return (
    <div className={cn('mx-auto max-w-md px-4 py-8 pointer-events-auto', containerClassName)}>
      <Card>
        <CardHeader>
          <TitleTag className={cn('font-semibold leading-none tracking-tight', titleClassName)}>
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


