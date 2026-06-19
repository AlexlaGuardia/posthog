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
    type = models.CharField(choices=Type, default=Type.String, max_length=20)
    format = models.CharField(choices=Format, default=None, null=True, max_length=32)
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
