package zodval

import (
	"fmt"
	"strings"
)

// ValidationError represents a single validation failure, mirroring
// the structure of ZodError issues.
type ValidationError struct {
	Path     []string // JSON path to the failing field (e.g. ["user", "address", "city"])
	Message  string   // Human-readable error message
	Code     string   // Machine-readable error code (e.g. "invalid_type", "too_small")
	Expected string   // Expected type or constraint
	Received string   // Actual type or value received
}

// Error implements the error interface.
func (e *ValidationError) Error() string {
	pathStr := "<root>"
	if len(e.Path) > 0 {
		pathStr = strings.Join(e.Path, ".")
	}
	if e.Code != "" {
		return fmt.Sprintf("[%s] %s: %s", e.Code, pathStr, e.Message)
	}
	return fmt.Sprintf("%s: %s", pathStr, e.Message)
}

// FormatPath renders the path as a dot-separated string.
func (e *ValidationError) FormatPath() string {
	if len(e.Path) == 0 {
		return "<root>"
	}
	return strings.Join(e.Path, ".")
}

// ValidationResult holds the outcome of a validation run.
// If Errors is empty, the validation succeeded.
type ValidationResult struct {
	Errors []*ValidationError
}

// IsValid returns true if there are no validation errors.
func (r *ValidationResult) IsValid() bool {
	return len(r.Errors) == 0
}

// Error implements the error interface (returns the first error or nil).
func (r *ValidationResult) Error() string {
	if r.IsValid() {
		return ""
	}
	var parts []string
	for _, e := range r.Errors {
		parts = append(parts, e.Error())
	}
	return strings.Join(parts, "; ")
}

// First returns the first error, or nil if valid.
func (r *ValidationResult) First() *ValidationError {
	if len(r.Errors) == 0 {
		return nil
	}
	return r.Errors[0]
}

// validation context carries the path through the validation tree.
type validationCtx struct {
	result *ValidationResult
}

func newValidationCtx() *validationCtx {
	return &validationCtx{
		result: &ValidationResult{Errors: []*ValidationError{}},
	}
}

func (vc *validationCtx) addError(path []string, code, message, expected, received string) {
	vc.result.Errors = append(vc.result.Errors, &ValidationError{
		Path:     append([]string{}, path...),
		Message:  message,
		Code:     code,
		Expected: expected,
		Received: received,
	})
}

// clonePath makes a copy of a path slice so subsequent appends don't mutate it.
func clonePath(path []string) []string {
	return append([]string{}, path...)
}
