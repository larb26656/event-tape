import { Highlight } from 'prism-react-renderer'

export function JsonViewer({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2)

  return (
    <Highlight code={json} language="json" theme={{ plain: {}, styles: [] }}>
      {({ tokens, getTokenProps }) => (
        <pre className="json-highlight bg-muted min-h-0 flex-1 overflow-auto p-4 text-xs leading-relaxed">
          {tokens.map((line, lineIndex) => (
            <span key={lineIndex}>
              {line.map((token, tokenIndex) => (
                <span key={tokenIndex} {...getTokenProps({ token })} />
              ))}
              {lineIndex < tokens.length - 1 ? '\n' : null}
            </span>
          ))}
        </pre>
      )}
    </Highlight>
  )
}
