import {
    CustomPropertyDisplayType,
    DISPLAY_TYPE_OPTIONS,
    displayTypeToModel,
    labelForModel,
    modelToDisplayType,
} from './customPropertyTypes'

describe('customPropertyTypes', () => {
    it.each(DISPLAY_TYPE_OPTIONS.map((option) => option.value))(
        'round-trips the "%s" display type through the model and back',
        (displayType) => {
            const model = displayTypeToModel(displayType as CustomPropertyDisplayType, false)
            expect(modelToDisplayType(model)).toBe(displayType)
        }
    )

    it('preserves the big-number flag for numeric display types', () => {
        expect(displayTypeToModel('number', true).is_big_number).toBe(true)
        expect(displayTypeToModel('currency', true).is_big_number).toBe(true)
        expect(displayTypeToModel('percent', true).is_big_number).toBe(true)
    })

    it('forces the big-number flag off for non-numeric display types', () => {
        expect(displayTypeToModel('text', true).is_big_number).toBe(false)
        expect(displayTypeToModel('date', true).is_big_number).toBe(false)
        expect(displayTypeToModel('boolean', true).is_big_number).toBe(false)
    })

    it('never sets a format for text or boolean', () => {
        expect(displayTypeToModel('text', false).format).toBeNull()
        expect(displayTypeToModel('boolean', false).format).toBeNull()
    })

    it('maps percent_fraction onto the percent display type (not surfaced separately in v1)', () => {
        expect(modelToDisplayType({ type: 'numeric', format: 'percent_fraction' })).toBe('percent')
    })

    it('labels a model with its display-type label', () => {
        expect(labelForModel({ type: 'numeric', format: 'currency' })).toBe('Currency')
        expect(labelForModel({ type: 'datetime', format: 'YYYY-MM-DD hh:mm:ss' })).toBe('Date & time')
        expect(labelForModel({ type: 'string', format: null })).toBe('Text')
    })
})
