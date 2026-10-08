<?php
// ─── Compatibility scoring tests ─────────────────────────────────────────────
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class CompatibilityTest extends TestCase
{
    private function me(): array
    {
        return [
            'sect' => 'Ithna Ashari (Twelver)',
            'religiosity' => 'practicing',
            'marja' => 'Ayatollah Sistani',
            'languages' => 'Urdu, English',
            'diet' => 'Halal only',
            'timeline' => 'Within a year',
            'seekingGender' => 'female',
        ];
    }

    public function testNullWhenNoSect(): void
    {
        $score = CompatibilityService::score(['sect' => 'Ithna Ashari (Twelver)'], ['religiosity' => 'practicing']);
        $this->assertNull($score);
    }

    public function testSameSectScoresHigher(): void
    {
        $me = $this->me();
        $same = CompatibilityService::score(['sect' => 'Ithna Ashari (Twelver)', 'gender' => 'female'], $me);
        $diff = CompatibilityService::score(['sect' => 'Ismaili', 'gender' => 'female'], $me);
        $this->assertNotNull($same);
        $this->assertNotNull($diff);
        $this->assertGreaterThan($diff['breakdown']['faith'], $same['breakdown']['faith']);
    }

    public function testGenderMismatchFloorsScore(): void
    {
        $me = $this->me();
        $score = CompatibilityService::score(['sect' => 'Ithna Ashari (Twelver)', 'gender' => 'male'], $me);
        $this->assertSame(5, $score['overall']);
    }

    public function testScoreInRange(): void
    {
        $me = $this->me();
        $score = CompatibilityService::score([
            'sect' => 'Ithna Ashari (Twelver)',
            'gender' => 'female',
            'religiosity' => 'practicing',
            'is_verified' => true,
        ], $me);
        $this->assertGreaterThanOrEqual(35, $score['overall']);
        $this->assertLessThanOrEqual(99, $score['overall']);
        $this->assertNotEmpty($score['reasons']);
        $this->assertNotEmpty($score['topReason']);
    }
}
