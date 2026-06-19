from datetime import UTC, datetime

import pytest

from django.test import SimpleTestCase

from parameterized import parameterized

from products.customer_analytics.backend.models import CustomPropertyDefinition

Type = CustomPropertyDefinition.Type


class CustomPropertyDefinitionCoerceValueTest(SimpleTestCase):
    def _definition(self, type_: str) -> CustomPropertyDefinition:
        return CustomPropertyDefinition(name="prop", type=type_)

    @parameterized.expand(
        [
            ("numeric_from_int", Type.Numeric, 1000, 1000.0),
            ("numeric_from_float", Type.Numeric, 12.5, 12.5),
            ("numeric_from_string", Type.Numeric, "42", 42.0),
            ("boolean_from_bool", Type.Boolean, True, True),
            ("boolean_from_true_string", Type.Boolean, "true", True),
            ("boolean_from_false_string", Type.Boolean, "FALSE", False),
            ("string_passthrough", Type.String, "hello", "hello"),
            ("string_from_number", Type.String, 123, "123"),
        ]
    )
    def test_coerces_value_to_type(self, _name, type_, value, expected):
        result = self._definition(type_).coerce_value(value)
        assert result == expected
        assert type(result) is type(expected)

    def test_datetime_object_normalized_to_iso(self):
        when = datetime(2026, 6, 18, 12, 0, tzinfo=UTC)
        result = self._definition(Type.Datetime).coerce_value(when)
        assert result == when.isoformat()

    def test_datetime_string_parsed_and_renormalized(self):
        result = self._definition(Type.Datetime).coerce_value("2026-06-18T12:00:00+00:00")
        assert isinstance(result, str)
        assert datetime.fromisoformat(result) == datetime(2026, 6, 18, 12, 0, tzinfo=UTC)

    @parameterized.expand(
        [
            ("numeric_from_non_numeric_string", Type.Numeric, "abc"),
            ("boolean_from_arbitrary_string", Type.Boolean, "yes"),
            ("boolean_from_int", Type.Boolean, 1),
            ("datetime_from_unparseable_string", Type.Datetime, "not a date"),
            ("datetime_from_non_string", Type.Datetime, 123),
        ]
    )
    def test_rejects_value_not_coercible_to_type(self, _name, type_, value):
        with pytest.raises(ValueError):
            self._definition(type_).coerce_value(value)
