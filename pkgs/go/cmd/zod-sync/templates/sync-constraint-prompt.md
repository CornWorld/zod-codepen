## Task: Sync Zod upstream changes into zod-codepen

Zod has been updated from **{{.From}}** to **{{.To}}**. The following API changes were detected:

{{range .Delta.Changes}}

- **{{.Type}}**: {{.Name}}{{if .ZodAPI}} (`{{.ZodAPI}}`){{end}}{{if .Primitive}} on `{{.Primitive}}`{{end}}
  Source: {{.Source}}
  {{end}}

## Sync Actions Required

{{range .Actions}}

### {{.File}}

- **Template**: `{{.Template}}`
- **Variables**: {{range $k, $v := .Variables}}
  - `{{$k}}` = `{{$v}}`{{end}}
    {{if .SearchMarker}}- **Insert after**: `{{.SearchMarker}}`{{end}}

{{end}}

## Instructions

For each action above:

1. Read the target file
2. Fill in the template at the insertion point
3. Output the modified file as a unified diff

Do NOT modify any code outside the insertion points. Do NOT refactor existing code. Fill in template variables exactly as specified.
