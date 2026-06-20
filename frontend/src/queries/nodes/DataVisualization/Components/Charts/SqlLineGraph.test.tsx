import '@testing-library/jest-dom'

import { cleanup, configure, fireEvent, screen, waitFor } from '@testing-library/react'

import { setupJsdom, setupSyncRaf } from '@posthog/quill-charts/testing'

import { ChartSettings, ChartSettingsFormatting, DataVisualizationNode } from '~/queries/schema/schema-general'
import {
    type DataVizFixture,
    buildDataVisualizationQuery,
    getHogChart,
    HOVER,
    MONTHS,
    renderDataVisualization,
    sqlChart,
} from '~/test/insight-testing'
import { ChartDisplayType } from '~/types'

// Neither timeout is set globally (jest.setup leaves asyncUtilTimeout at 1s, jest.config has no
// testTimeout → 5s): this heavy ~7-logic mount needs findByRole headroom beyond 1s on CI, and
// sqlChart.hoverTooltip's internal waits (findByRole + tooltip poll) can sum past the 5s default.
configure({ asyncUtilTimeout: 5000 })
jest.setTimeout(15000)

let cleanupJsdom: () => void
let cleanupRaf: () => void

beforeEach(() => {
    cleanupJsdom = setupJsdom()
    cleanupRaf = setupSyncRaf()
})

afterEach(() => {
    cleanupRaf()
    cleanupJsdom()
    cleanup()
})

/** One numeric column per name, six monthly rows; `valueAt(i)` fills each column. */
function lineFixture(columns: { name: string; type?: string; valueAt: (i: number) => unknown }[]): DataVizFixture {
    return {
        columns: ['month', ...columns.map((c) => c.name)],
        types: [['month', 'Date'], ...columns.map((c): [string, string] => [c.name, c.type ?? 'UInt64'])],
        results: MONTHS.map((m, i) => [m, ...columns.map((c) => c.valueAt(i))]),
    }
}

/** Two numeric series (a × 100, b × 10) over the shared months — the common multi-series fixture. */
const twoSeries = (): DataVizFixture =>
    lineFixture([
        { name: 'a', valueAt: (i) => (i + 1) * 100 },
        { name: 'b', valueAt: (i) => (i + 1) * 10 },
    ])

const renderLine = (
    chartSettings: ChartSettings,
    fixture: DataVizFixture,
    extra?: Partial<DataVisualizationNode>
): ReturnType<typeof renderDataVisualization> =>
    renderDataVisualization({
        query: buildDataVisualizationQuery({
            display: ChartDisplayType.ActionsLineGraph,
            chartSettings: { xAxis: { column: 'month' }, ...chartSettings },
            ...extra,
        }),
        response: fixture,
    })

describe('SqlLineGraph', () => {
    describe('tooltip', () => {
        it('shows the series value, swatch, and hovered x-label for a single series', async () => {
            renderLine(
                { yAxis: [{ column: 'pageviews' }] },
                lineFixture([{ name: 'pageviews', valueAt: (i) => (i + 1) * 100 }])
            )

            await screen.findByRole('img', { name: /chart with/i })
            const tooltip = await sqlChart.hoverTooltip(HOVER, MONTHS.length)

            expect(tooltip.row('pageviews')).toBe('300')
            expect(tooltip.title()).toBe('2025-12-01')
            expect(tooltip.swatchColors()).toHaveLength(1)
        })

        it('shows one row per series with its own value', async () => {
            renderLine({ yAxis: [{ column: 'a' }, { column: 'b' }] }, twoSeries())

            await screen.findByRole('img', { name: /chart with 2 data series/i })
            const tooltip = await sqlChart.hoverTooltip(HOVER, MONTHS.length)

            expect(tooltip.rows()).toEqual(['a', 'b'])
            expect(tooltip.row('a')).toBe('300')
            expect(tooltip.row('b')).toBe('30')
        })

        it.each<{ name: string; formatting: ChartSettingsFormatting; value: number; expected: string }>([
            { name: 'thousands separators', formatting: { style: 'number' }, value: 12345, expected: '12,345' },
            { name: 'compact short', formatting: { style: 'short' }, value: 12345, expected: '12.3 K' },
            { name: 'percent (scaled x100)', formatting: { style: 'percent' }, value: 12.5, expected: '1,250%' },
            { name: 'fixed decimals', formatting: { decimalPlaces: 2 }, value: 3.14159, expected: '3.14' },
            { name: 'prefix', formatting: { prefix: '$' }, value: 3000, expected: '$3000' },
            { name: 'suffix', formatting: { suffix: ' ms' }, value: 3000, expected: '3000 ms' },
        ])('formats the tooltip value with $name', async ({ formatting, value, expected }) => {
            renderLine(
                { yAxis: [{ column: 'a', settings: { formatting } }] },
                lineFixture([{ name: 'a', type: 'Float64', valueAt: (i) => (i === HOVER ? value : value / 2) }])
            )

            await screen.findByRole('img', { name: /chart with/i })
            const tooltip = await sqlChart.hoverTooltip(HOVER, MONTHS.length)

            // compactNumber separates magnitude with a non-breaking space; normalize for comparison.
            expect(tooltip.row('a')?.replace(/\u00a0/g, ' ')).toBe(expected)
        })

        it.each([
            { name: 'shows a total row for two or more series', showTotalRow: undefined, expectedTotal: '330' },
            { name: 'hides the total row when showTotalRow is false', showTotalRow: false, expectedTotal: undefined },
        ])('$name', async ({ showTotalRow, expectedTotal }) => {
            renderLine({ yAxis: [{ column: 'a' }, { column: 'b' }], showTotalRow }, twoSeries())

            await screen.findByRole('img', { name: /chart with 2 data series/i })
            const tooltip = await sqlChart.hoverTooltip(HOVER, MONTHS.length)

            expect(tooltip.total()).toBe(expectedTotal)
        })
    })

    describe('per-series color', () => {
        it('pins explicit display colors onto each tooltip swatch', async () => {
            renderLine(
                {
                    yAxis: [
                        { column: 'a', settings: { display: { color: '#ff0000' } } },
                        { column: 'b', settings: { display: { color: '#00ff00' } } },
                    ],
                },
                twoSeries()
            )

            await screen.findByRole('img', { name: /chart with 2 data series/i })
            const tooltip = await sqlChart.hoverTooltip(HOVER, MONTHS.length)

            expect(tooltip.swatchColors()).toEqual(['rgb(255, 0, 0)', 'rgb(0, 255, 0)'])
        })
    })

    describe('legend', () => {
        const getLegend = (container: HTMLElement): HTMLElement =>
            container.querySelector<HTMLElement>('[data-attr="hog-chart-timeseries-line-legend"]')!

        it('renders an in-chart legend listing every series when showLegend is set', async () => {
            const { container } = renderLine(
                { yAxis: [{ column: 'a' }, { column: 'b' }], showLegend: true },
                twoSeries()
            )

            await screen.findByRole('img', { name: /chart with 2 data series/i })
            const labels = [...getLegend(container).querySelectorAll('button')].map((b) => b.textContent)
            expect(labels).toEqual(['a', 'b'])
        })

        it('renders no legend by default', async () => {
            const { container } = renderLine({ yAxis: [{ column: 'a' }, { column: 'b' }] }, twoSeries())

            await screen.findByRole('img', { name: /chart with 2 data series/i })
            expect(container.querySelector('[data-attr="hog-chart-timeseries-line-legend"]')).not.toBeInTheDocument()
        })

        it('hides a series from the chart and tooltip when its legend item is toggled off', async () => {
            const { container } = renderLine(
                { yAxis: [{ column: 'a' }, { column: 'b' }], showLegend: true },
                twoSeries()
            )

            await screen.findByRole('img', { name: /chart with 2 data series/i })
            const bButton = [...getLegend(container).querySelectorAll('button')].find((b) =>
                b.textContent?.includes('b')
            )!
            fireEvent.click(bButton)

            await waitFor(() => expect(getHogChart().seriesCount).toBe(1))
            const tooltip = await sqlChart.hoverTooltip(HOVER, MONTHS.length)
            expect(tooltip.rows()).toEqual(['a'])
        })
    })

    describe('axis titles', () => {
        it.each([
            {
                name: 'renders custom axis titles from chart settings',
                settings: { xAxisLabel: 'Signup month', leftYAxisSettings: { label: 'Unique users' } },
                expectedX: 'Signup month',
                expectedY: 'Unique users',
            },
            { name: 'renders no axis titles when none are configured', settings: {}, expectedX: null, expectedY: null },
        ])('$name', async ({ settings, expectedX, expectedY }) => {
            renderLine(
                { yAxis: [{ column: 'pageviews' }], ...settings },
                lineFixture([{ name: 'pageviews', valueAt: (i) => (i + 1) * 100 }])
            )

            await screen.findByRole('img', { name: /chart with/i })
            expect(getHogChart().xAxisLabel()).toBe(expectedX)
            expect(getHogChart().yAxisLabel()).toBe(expectedY)
        })
    })

    describe('x-axis ticks', () => {
        it('formats a date x-axis into readable tick labels', async () => {
            renderLine(
                { yAxis: [{ column: 'pageviews' }] },
                lineFixture([{ name: 'pageviews', valueAt: (i) => (i + 1) * 100 }])
            )

            await screen.findByRole('img', { name: /chart with/i })
            await waitFor(() => expect(getHogChart().xTicks().length).toBeGreaterThan(0))
            // Date-axis tick formatter renders month names (year shown at the Jan boundary).
            expect(getHogChart().xTicks()).toEqual(expect.arrayContaining(['October', 'November', 'December']))
        })

        it('hides x-axis ticks when showXAxisTicks is false', async () => {
            renderLine(
                { yAxis: [{ column: 'pageviews' }], showXAxisTicks: false },
                lineFixture([{ name: 'pageviews', valueAt: (i) => (i + 1) * 100 }])
            )

            await screen.findByRole('img', { name: /chart with/i })
            expect(getHogChart().xTicks()).toHaveLength(0)
        })
    })

    describe('y-axis scale', () => {
        it('renders logarithmic ticks when the left axis scale is logarithmic', async () => {
            renderLine(
                { yAxis: [{ column: 'a' }], leftYAxisSettings: { scale: 'logarithmic' } },
                lineFixture([{ name: 'a', valueAt: (i) => (i + 1) * 100 }])
            )

            await screen.findByRole('img', { name: /chart with/i })
            await waitFor(() => expect(getHogChart().yTicks().length).toBeGreaterThan(0))
            // A log axis lays out ticks per power of ten (10, 20, … 100, 200, …) rather than evenly.
            expect(getHogChart().yTicks()).toEqual(expect.arrayContaining(['10', '100']))
        })
    })

    describe('trend lines', () => {
        it('adds a trend-line series without adding a tooltip row', async () => {
            renderLine(
                { yAxis: [{ column: 'a', settings: { display: { trendLine: true } } }] },
                lineFixture([{ name: 'a', valueAt: (i) => (i + 1) * 100 }])
            )

            // One data series + one trend line = 2 rendered series.
            await waitFor(() => expect(getHogChart().seriesCount).toBe(2))

            const tooltip = await sqlChart.hoverTooltip(HOVER, MONTHS.length)
            expect(tooltip.rows()).toEqual(['a'])
        })
    })

    describe('goal lines', () => {
        it.each([
            {
                name: 'renders a goal line with its label',
                goalLines: [{ label: 'Target', value: 250, displayIfCrossed: true }],
                expectedLabels: ['Target'],
            },
            {
                name: 'renders multiple goal lines in order',
                goalLines: [
                    { label: 'Floor', value: 50, displayIfCrossed: true },
                    { label: 'Ceiling', value: 550, displayIfCrossed: true },
                ],
                expectedLabels: ['Floor', 'Ceiling'],
            },
        ])('$name', async ({ goalLines, expectedLabels }) => {
            renderLine(
                { yAxis: [{ column: 'a' }], goalLines },
                lineFixture([{ name: 'a', valueAt: (i) => (i + 1) * 100 }])
            )

            await screen.findByRole('img', { name: /chart with/i })
            const lines = getHogChart().referenceLines()
            expect(lines.map((l) => l.label)).toEqual(expectedLabels)
            for (const line of lines) {
                expect(line.orientation).toBe('horizontal')
            }
        })
    })

    describe('area chart', () => {
        it('renders an area graph without crashing', async () => {
            renderDataVisualization({
                query: buildDataVisualizationQuery({
                    display: ChartDisplayType.ActionsAreaGraph,
                    chartSettings: { xAxis: { column: 'month' }, yAxis: [{ column: 'a' }, { column: 'b' }] },
                }),
                response: twoSeries(),
            })

            await screen.findByRole('img', { name: /chart with 2 data series/i })
            const tooltip = await sqlChart.hoverTooltip(HOVER, MONTHS.length)
            expect(tooltip.row('a')).toBe('300')
        })
    })

    describe('null handling', () => {
        const withGap = (): DataVizFixture =>
            lineFixture([{ name: 'a', valueAt: (i) => (i === HOVER ? null : (i + 1) * 100) }])

        it.each([
            {
                name: 'draws a null as a gap — the point is absent from the tooltip',
                showNullsAsZero: undefined,
                expected: undefined,
            },
            { name: 'plots a null as zero when showNullsAsZero is set', showNullsAsZero: true, expected: '0' },
        ])('$name', async ({ showNullsAsZero, expected }) => {
            renderLine({ yAxis: [{ column: 'a' }], showNullsAsZero }, withGap())

            await screen.findByRole('img', { name: /chart with/i })
            const tooltip = await sqlChart.hoverTooltip(HOVER, MONTHS.length)
            expect(tooltip.row('a')).toBe(expected)
        })
    })
})
