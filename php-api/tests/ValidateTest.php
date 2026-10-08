<?php
// ─── Validation tests ────────────────────────────────────────────────────────
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class ValidateTest extends TestCase
{
    public function testRequiredFailsOnMissing(): void
    {
        $v = validate([], ['email' => 'required|email']);
        $this->assertFalse($v->ok);
        $this->assertArrayHasKey('email', $v->errors);
    }

    public function testEmailValidation(): void
    {
        $v = validate(['email' => 'not-an-email'], ['email' => 'required|email']);
        $this->assertFalse($v->ok);

        $v = validate(['email' => 'user@example.com'], ['email' => 'required|email']);
        $this->assertTrue($v->ok);
        $this->assertSame('user@example.com', $v->get('email'));
    }

    public function testMinMaxString(): void
    {
        $v = validate(['password' => 'short'], ['password' => 'required|min:8']);
        $this->assertFalse($v->ok);

        $v = validate(['password' => 'longenoughpassword'], ['password' => 'required|min:8|max:128']);
        $this->assertTrue($v->ok);
    }

    public function testIntRange(): void
    {
        $v = validate(['age' => 15], ['age' => 'int|min:18|max:100']);
        $this->assertFalse($v->ok);

        $v = validate(['age' => 25], ['age' => 'int|min:18|max:100']);
        $this->assertTrue($v->ok);
        $this->assertSame(25, $v->get('age'));
    }

    public function testInList(): void
    {
        $v = validate(['role' => 'hacker'], ['role' => 'in:member,guardian,matchmaker']);
        $this->assertFalse($v->ok);

        $v = validate(['role' => 'matchmaker'], ['role' => 'in:member,guardian,matchmaker']);
        $this->assertTrue($v->ok);
    }

    public function testTrimsStrings(): void
    {
        $v = validate(['city' => '  Hyderabad  '], ['city' => 'max:120']);
        $this->assertTrue($v->ok);
        $this->assertSame('Hyderabad', $v->get('city'));
    }

    public function testOptionalEmptySkipsRules(): void
    {
        $v = validate([], ['nickname' => 'max:30']);
        $this->assertTrue($v->ok);
        $this->assertNull($v->get('nickname'));
    }
}
