<?php
// ─── Input validation ────────────────────────────────────────────────────────
// Schema-based validation for API inputs. Replaces ad-hoc sanitizeText()
// calls scattered through route handlers.
//
// Usage:
//   $v = validate($body, [
//       'email'    => 'required|email|max:320',
//       'password' => 'required|min:8|max:128',
//       'age'      => 'int|min:18|max:100',
//       'city'     => 'max:120',
//   ]);
//   if (!$v->ok) json(['error' => $v->firstError()], 400);
//   $email = $v->get('email');
//
// Rules: required, email, int, bool, min:N, max:N, in:a,b,c, url, array

declare(strict_types=1);

class ValidationResult
{
    public bool $ok = true;
    /** @var array<string,string> */
    public array $errors = [];
    /** @var array<string,mixed> */
    private array $data = [];

    public function firstError(): string
    {
        return $this->errors ? reset($this->errors) : 'Invalid input.';
    }

    public function get(string $key, $default = null)
    {
        return $this->data[$key] ?? $default;
    }

    /** @return array<string,mixed> */
    public function all(): array
    {
        return $this->data;
    }

    /** @internal */
    public function set(string $key, $value): void
    {
        $this->data[$key] = $value;
    }

    /** @internal */
    public function fail(string $key, string $message): void
    {
        $this->ok = false;
        if (!isset($this->errors[$key])) {
            $this->errors[$key] = $message;
        }
    }
}

/**
 * @param array<string,mixed> $input
 * @param array<string,string> $rules field => "required|email|max:320"
 */
function validate(array $input, array $rules): ValidationResult
{
    $result = new ValidationResult();
    foreach ($rules as $field => $ruleStr) {
        $value = $input[$field] ?? null;
        $ruleList = explode('|', $ruleStr);
        $isRequired = in_array('required', $ruleList, true);

        // Required check first.
        if ($isRequired && ($value === null || $value === '' || (is_array($value) && !$value))) {
            $result->fail($field, ucfirst($field) . ' is required.');
            continue;
        }
        // Optional and empty — skip other rules, store null.
        if (!$isRequired && ($value === null || $value === '')) {
            $result->set($field, null);
            continue;
        }

        foreach ($ruleList as $rule) {
            if ($rule === 'required') continue;
            [$name, $param] = array_pad(explode(':', $rule, 2), 2, null);

            switch ($name) {
                case 'email':
                    if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
                        $result->fail($field, 'Enter a valid email address.');
                    }
                    break;
                case 'int':
                    if (!is_numeric($value) || (int)$value != $value) {
                        $result->fail($field, ucfirst($field) . ' must be a whole number.');
                    } else {
                        $value = (int)$value;
                    }
                    break;
                case 'bool':
                    if (!in_array($value, [true, false, 0, 1, '0', '1'], true)) {
                        $result->fail($field, ucfirst($field) . ' must be true or false.');
                    } else {
                        $value = (bool)$value;
                    }
                    break;
                case 'min':
                    if (is_numeric($value) && in_array('int', $ruleList, true)) {
                        if ($value < (int)$param) $result->fail($field, ucfirst($field) . " must be at least $param.");
                    } elseif (mb_strlen((string)$value) < (int)$param) {
                        $result->fail($field, ucfirst($field) . " must be at least $param characters.");
                    }
                    break;
                case 'max':
                    if (is_numeric($value) && in_array('int', $ruleList, true)) {
                        if ($value > (int)$param) $result->fail($field, ucfirst($field) . " must be at most $param.");
                    } elseif (mb_strlen((string)$value) > (int)$param) {
                        $result->fail($field, ucfirst($field) . " must be at most $param characters.");
                    }
                    break;
                case 'in':
                    $allowed = explode(',', (string)$param);
                    if (!in_array((string)$value, $allowed, true)) {
                        $result->fail($field, ucfirst($field) . ' has an invalid value.');
                    }
                    break;
                case 'url':
                    if (!filter_var($value, FILTER_VALIDATE_URL)) {
                        $result->fail($field, ucfirst($field) . ' must be a valid URL.');
                    }
                    break;
                case 'array':
                    if (!is_array($value)) {
                        $result->fail($field, ucfirst($field) . ' must be a list.');
                    }
                    break;
            }
            if (!$result->ok && isset($result->errors[$field])) break;
        }

        if (!isset($result->errors[$field])) {
            // Trim strings by default — kills whitespace-only and padded input.
            $result->set($field, is_string($value) ? trim($value) : $value);
        }
    }
    return $result;
}
