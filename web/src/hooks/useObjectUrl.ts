import { useEffect, useState } from 'react'

/**
 * Create an object URL for a Blob/File and revoke it on change/unmount.
 * Shared by admin file previews (poster image, movie/episode video).
 */
export function useObjectUrl(source: Blob | File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!source) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(source)
    setUrl(next)
    return () => {
      URL.revokeObjectURL(next)
    }
  }, [source])

  return url
}
