<?php
/**
 * UI Configuration endpoint for mobile apps (and web).
 *
 * GET /api/config/ui
 *
 * Returns labels, filter options, and feature flags that the mobile apps
 * fetch at launch. Changing these values on the server propagates to the
 * apps automatically — no app code change or store update needed.
 *
 * This is the "API-driven labels" half of the web↔app connection.
 */

function handleUiConfig(): void
{
    // Gender labels used in profile search / browse screens.
    // Keep in sync with the website's search filters.
    $genderOptions = [
        ['label' => 'Female', 'value' => 'female'],
        ['label' => 'Male', 'value' => 'male'],
    ];

    // Profile search filters: which filters the apps should render.
    // The website removed the Marja filter — apps follow via this flag.
    $searchFilters = [
        'gender' => [
            'enabled' => true,
            'options' => $genderOptions,
        ],
        'marja' => [
            'enabled' => false,
        ],
        'age' => ['enabled' => true, 'min' => 18, 'max' => 60],
        'city' => ['enabled' => true],
    ];

    // Feature flags the apps can honor without a code push.
    $features = [
        'blog' => true,
        'community' => true,
        'matchmaker' => true,
        'biodata_maker' => true,
    ];

    json([
        'ok' => true,
        'config' => [
            'genderOptions' => $genderOptions,
            'searchFilters' => $searchFilters,
            'features' => $features,
        ],
        // Bump when the shape changes so apps can invalidate caches.
        'version' => 1,
    ]);
}
