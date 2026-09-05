import { useEffect } from 'react'

type Props = {
  title?: string
  description?: string
  image?: string
  jsonLd?: Record<string, unknown>
}

/** COMP-009: client-side SEO meta without extra deps. */
export function SeoHead({ title, description, image, jsonLd }: Props) {
  useEffect(() => {
    const prevTitle = document.title
    if (title) document.title = title

    const ensure = (attr: string, key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.appendChild(el)
      }
      el.content = content
    }

    if (description) {
      ensure('name', 'description', description)
      ensure('property', 'og:description', description)
      ensure('name', 'twitter:description', description)
    }
    if (title) {
      ensure('property', 'og:title', title)
      ensure('name', 'twitter:title', title)
    }
    if (image) {
      ensure('property', 'og:image', image)
      ensure('name', 'twitter:image', image)
    }

    let script: HTMLScriptElement | null = null
    if (jsonLd) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.dataset.seo = '1'
      script.text = JSON.stringify(jsonLd)
      document.head.querySelectorAll('script[data-seo="1"]').forEach((n) => n.remove())
      document.head.appendChild(script)
    }

    return () => {
      document.title = prevTitle
      if (script) script.remove()
    }
  }, [title, description, image, jsonLd])

  return null
}
