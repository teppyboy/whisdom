export type InterfaceLanguage = "en" | "vi"
export type CopyPrimitive = string | number | boolean | null
export type CopyParams = Readonly<Record<string, CopyPrimitive>>
export type CopyLeaf = string | ((params: CopyParams) => string)
export type CopyShape = { readonly [key: string]: CopyLeaf | CopyShape }
export type LocalizedCopy<T extends CopyShape> = Readonly<{ en: T; vi: T }>
export function defineCopy<const T extends CopyShape>(copy: {
  en: T
  vi: T
}): LocalizedCopy<T> {
  return copy
}
