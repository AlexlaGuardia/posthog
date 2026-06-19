import {
    CustomPropertyDefinitionFormatEnumApi,
    CustomPropertyDefinitionTypeEnumApi,
} from 'products/customer_analytics/frontend/generated/api.schemas'

// The model splits a property's shape across `type`, `format`, and `is_big_number`.
// The form hides that split behind one friendly "display type". The mapping lives
// entirely here so it unit-tests in isolation and the round-trip is verifiable.
export type CustomPropertyDisplayType = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'boolean'

export interface CustomPropertyModelShape {
    type: CustomPropertyDefinitionTypeEnumApi
    format: CustomPropertyDefinitionFormatEnumApi | null
    is_big_number: boolean
}

export interface DisplayTypeOption {
    value: CustomPropertyDisplayType
    label: string
    isNumeric: boolean
}

export const DISPLAY_TYPE_OPTIONS: DisplayTypeOption[] = [
    { value: 'text', label: 'Text', isNumeric: false },
    { value: 'number', label: 'Number', isNumeric: true },
    { value: 'currency', label: 'Currency', isNumeric: true },
    { value: 'percent', label: 'Percent', isNumeric: true },
    { value: 'date', label: 'Date', isNumeric: false },
    { value: 'datetime', label: 'Date & time', isNumeric: false },
    { value: 'boolean', label: 'True / false', isNumeric: false },
]

export function displayTypeToModel(
    displayType: CustomPropertyDisplayType,
    isBigNumber: boolean
): CustomPropertyModelShape {
    switch (displayType) {
        case 'text':
            return { type: CustomPropertyDefinitionTypeEnumApi.String, format: null, is_big_number: false }
        case 'number':
            return {
                type: CustomPropertyDefinitionTypeEnumApi.Numeric,
                format: CustomPropertyDefinitionFormatEnumApi.Decimal,
                is_big_number: isBigNumber,
            }
        case 'currency':
            return {
                type: CustomPropertyDefinitionTypeEnumApi.Numeric,
                format: CustomPropertyDefinitionFormatEnumApi.Currency,
                is_big_number: isBigNumber,
            }
        case 'percent':
            return {
                type: CustomPropertyDefinitionTypeEnumApi.Numeric,
                format: CustomPropertyDefinitionFormatEnumApi.Percent,
                is_big_number: isBigNumber,
            }
        case 'date':
            return {
                type: CustomPropertyDefinitionTypeEnumApi.Datetime,
                format: CustomPropertyDefinitionFormatEnumApi.YyyyMmDd,
                is_big_number: false,
            }
        case 'datetime':
            return {
                type: CustomPropertyDefinitionTypeEnumApi.Datetime,
                format: CustomPropertyDefinitionFormatEnumApi.YYYYMMDDHhMmSs,
                is_big_number: false,
            }
        case 'boolean':
            return { type: CustomPropertyDefinitionTypeEnumApi.Boolean, format: null, is_big_number: false }
    }
}

export function modelToDisplayType(model: {
    type: CustomPropertyDefinitionTypeEnumApi
    format?: CustomPropertyDefinitionFormatEnumApi | null
}): CustomPropertyDisplayType {
    switch (model.type) {
        case CustomPropertyDefinitionTypeEnumApi.String:
            return 'text'
        case CustomPropertyDefinitionTypeEnumApi.Boolean:
            return 'boolean'
        case CustomPropertyDefinitionTypeEnumApi.Datetime:
            return model.format === CustomPropertyDefinitionFormatEnumApi.YYYYMMDDHhMmSs ? 'datetime' : 'date'
        case CustomPropertyDefinitionTypeEnumApi.Numeric:
            if (model.format === CustomPropertyDefinitionFormatEnumApi.Currency) {
                return 'currency'
            }
            if (
                model.format === CustomPropertyDefinitionFormatEnumApi.Percent ||
                model.format === CustomPropertyDefinitionFormatEnumApi.PercentFraction
            ) {
                return 'percent'
            }
            return 'number'
        default:
            return 'text'
    }
}

export function labelForModel(model: {
    type: CustomPropertyDefinitionTypeEnumApi
    format?: CustomPropertyDefinitionFormatEnumApi | null
}): string {
    const displayType = modelToDisplayType(model)
    return DISPLAY_TYPE_OPTIONS.find((option) => option.value === displayType)?.label ?? displayType
}
