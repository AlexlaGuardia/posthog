from datetime import datetime
from typing import Any

from django.db import models

from posthog.models.scoping.root_mixin import TeamScopedRootMixin
from posthog.models.utils import CreatedMetaFields, UpdatedMetaFields, UUIDModel


class CustomPropertyDefinition(TeamScopedRootMixin, UUIDModel, CreatedMetaFields, UpdatedMetaFields):
    class Type(models.TextChoices):
        String = "string", "String"
        Numeric = "numeric", "Numeric"
        Boolean = "boolean", "Boolean"
        Datetime = "datetime", "DateTime"

    class Format(models.TextChoices):
        Currency = "currency", "Currency"
        Decimal = "decimal", "Decimal"
        Date = "YYYY-MM-DD", "YYYY-MM-DD"
        DateTime = "YYYY-MM-DD hh:mm:ss", "YYYY-MM-DD hh:mm:ss"
        PercentFraction = "percent_fraction", "Percent Fraction"
        Percent = "percent", "Percent"

    team = models.ForeignKey("posthog.Team", on_delete=models.CASCADE)

    name = models.CharField(max_length=400)
    description = models.TextField(null=True)
    type = models.CharField(choices=Type, default=Type.String)
    format = models.CharField(choices=Format, default=None, null=True)
    is_big_number = models.BooleanField(
        default=False, help_text="Whether the property is a big number and should be abbreviated. E.g.: 10,000 -> 10K"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["team", "name"],
                name="unique_custom_property_per_team",
            )
        ]

    def coerce_value(self, value: Any) -> float | str | bool:
        match self.type:
            case self.Type.Numeric:
                try:
                    return float(value)
                except (TypeError, ValueError):
                    raise ValueError(f"Custom property '{self.name}' expects a numeric value")

            case self.Type.Boolean:
                if isinstance(value, bool):
                    return value
                if isinstance(value, str) and value.strip().lower() in ("true", "false"):
                    return value.strip().lower() == "true"
                raise ValueError(f"Custom property '{self.name}' expects a boolean value")

            case self.Type.Datetime:
                if isinstance(value, datetime):
                    return value.isoformat()
                if isinstance(value, str):
                    try:
                        return datetime.fromisoformat(value).isoformat()
                    except ValueError:
                        raise ValueError(f"Custom property '{self.name}' expects an ISO-8601 datetime")
                raise ValueError(f"Custom property '{self.name}' expects an ISO-8601 datetime")

            case self.Type.String | _:
                return value if isinstance(value, str) else str(value)
