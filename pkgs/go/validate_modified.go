package zodval

// validateModified processes the modifier chain applied to an inner node.
// Modifiers are applied in order (innermost first in the array).
//
// Key semantics:
//   - optional: nil/missing input → valid (skip inner validation)
//   - nullable: nil input → valid (skip inner validation)
//   - nullish: nil input → valid (skip inner validation)
//   - default: nil input → use default value, then validate inner
//   - catch: nil input → use catch value, then validate inner
//   - prefault: nil input → use prefault value, then validate inner
//   - brand: no validation effect (just a type-level marker)
//   - readonly: no validation effect
func validateModified(vc *validationCtx, n *ModifiedNode, path []string, input any) {
	// Walk modifiers from outermost to innermost.
	// The array order is [innermost, ..., outermost].
	// We process from the end (outermost) to the beginning (innermost).
	current := input

	for i := len(n.Modifiers) - 1; i >= 0; i-- {
		m := n.Modifiers[i]
		switch m.Name {
		case ModOptional:
			if current == nil {
				// Optional + nil → valid, no further validation needed.
				return
			}
		case ModNullable:
			if current == nil {
				return
			}
		case ModNullish:
			if current == nil {
				return
			}
		case ModDefault:
			if current == nil {
				if m.Value != nil {
					current = m.Value.Any()
				} else if m.Placeholder != nil {
					// Can't reconstruct the default — skip.
					return
				}
			}
		case ModCatch:
			if current == nil {
				if m.Value != nil {
					current = m.Value.Any()
				} else if m.Placeholder != nil {
					return
				}
			}
		case ModPrefault:
			if current == nil {
				if m.Value != nil {
					current = m.Value.Any()
				} else if m.Placeholder != nil {
					return
				}
			}
		case ModBrand:
			// Brand has no runtime validation effect.
		case ModReadonly:
			// Readonly has no runtime validation effect.
		}
	}

	// After processing all modifiers, validate the inner node with the
	// (possibly substituted) value.
	validate(vc, n.Inner, path, current)
}

func validateLazy(vc *validationCtx, n *LazyNode, path []string, input any) {
	if n.Inner != nil {
		validate(vc, n.Inner, path, input)
	} else {
		// Placeholder lazy — can't validate, accept anything.
		// This mirrors z.lazy(() => ...) with a circular reference placeholder.
	}
}

func validatePromise(vc *validationCtx, n *PromiseNode, path []string, input any) {
	// In a synchronous validator, we validate the inner value directly.
	// The promise wrapper has no effect in Go's synchronous validation.
	validate(vc, n.Inner, path, input)
}

func validatePipe(vc *validationCtx, n *PipeNode, path []string, input any) {
	// z.pipe(in, out) validates input against `in`, then the result would be
	// validated against `out`. Since transforms contain JS functions, we can
	// only validate against `in`.
	validate(vc, n.In, path, input)
}
