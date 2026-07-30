using System.Text.Json.Nodes;
using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Assets.Exports.Engine;
using CUE4Parse.UE4.Assets.Objects;
using CUE4Parse.UE4.Objects.Core.i18N;
using CUE4Parse.UE4.Objects.UObject;
using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Discovery;

namespace PalHatchHelper.CatalogExtractor.Readers;

internal static class ConfirmedCatalogReaders
{
  private const string PalTablePath = "Pal/Content/Pal/DataTable/Character/DT_PalMonsterParameter";
  private const string PalTableAsset = PalTablePath + ".uasset";
  private const string PalIconTablePath = "Pal/Content/Pal/DataTable/Character/DT_PalCharacterIconDataTable";
  private const string PassiveTablePath = "Pal/Content/Pal/DataTable/PassiveSkill/DT_PassiveSkill_Main";
  private const string ActiveTablePath = "Pal/Content/Pal/DataTable/Waza/DT_WazaDataTable";
  private const string MasterLevelTablePath = "Pal/Content/Pal/DataTable/Waza/DT_WazaMasterLevel";
  private const string PartnerParameterTablePath = "Pal/Content/Pal/DataTable/PassiveSkill/DT_PartnerSkillParameter";
  private const string UniqueBreedingTablePath = "Pal/Content/Pal/DataTable/Character/DT_PalCombiUnique";
  private const string ItemTablePath = "Pal/Content/Pal/DataTable/Item/DT_ItemDataTable";
  private const string ItemRecipeTablePath = "Pal/Content/Pal/DataTable/Item/DT_ItemRecipeDataTable";
  private const string ItemRedirectTablePath = "Pal/Content/Pal/DataTable/Item/DT_PalStaticItemIDRedirectData";
  private const string BlueprintBasePath = "Pal/Content/Pal/Blueprint/Character/Monster/PalActorBP/";

  internal static ICatalogReader[] Create(ExtractionConfig config)
  {
    using var provider = ProviderFactory.OpenReadOnly(config);
    var results = Build(provider, config.Locales);
    return CatalogCategories.All
        .Select(definition => (ICatalogReader)new SnapshotCatalogReader(definition.Category, results[definition.Category]))
        .ToArray();
  }

  private static Dictionary<CatalogCategory, ReaderResult> Build(
      DefaultFileProvider provider,
      IReadOnlyList<string> locales)
  {
    var localization = ReadLocalizations(provider, locales);
    var pals = ReadPals(provider, localization);
    var passives = ReadPassives(provider, localization);
    var active = ReadActiveSkills(provider, localization);
    var palActive = ReadPalActiveSkills(provider, pals.Facts, active.Facts);
    var partners = ReadPartnerSkills(provider, pals.Facts, localization);
    var breeding = ReadBreedingRecipes(provider, pals.Facts);
    var items = ReadItems(provider, localization);
    var itemRecipes = ReadItemRecipes(provider, items.Facts);

    return new Dictionary<CatalogCategory, ReaderResult>
    {
      [CatalogCategory.Pals] = pals.Result,
      [CatalogCategory.PassiveSkills] = passives,
      [CatalogCategory.ActiveSkills] = active.Result,
      [CatalogCategory.PalActiveSkills] = palActive,
      [CatalogCategory.PartnerSkills] = partners,
      [CatalogCategory.BreedingRecipes] = breeding,
      [CatalogCategory.Items] = items.Result,
      [CatalogCategory.ItemRecipes] = itemRecipes,
      [CatalogCategory.Localizations] = localization.ToReaderResult(),
    };
  }

  private static LocalizationFacts ReadLocalizations(DefaultFileProvider provider, IReadOnlyList<string> locales)
  {
    var records = new List<JsonObject>();
    var evidence = new List<SourceEvidenceRecord>();
    var keysByLocale = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
    var textsByLocale = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
    foreach (var locale in locales.Order(StringComparer.Ordinal))
    {
      var keys = new HashSet<string>(StringComparer.Ordinal);
      keysByLocale.Add(locale, keys);
      var texts = new Dictionary<string, string>(StringComparer.Ordinal);
      textsByLocale.Add(locale, texts);
      foreach (var table in LocalizationTables(locale))
      {
        var data = provider.LoadPackageObject<UDataTable>(table.AssetPathWithoutExtension);
        foreach (var row in data.RowMap.OrderBy(value => value.Key.Text, StringComparer.Ordinal))
        {
          var textKey = LocalizationKey(table.Namespace, row.Key.Text);
          var text = row.Value.Get<FText>("TextData").Text;
          if (!keys.Add(textKey))
          {
            throw new ExtractorException(
                ErrorCodes.GameIdNormalizationCollision,
                "A locale contains a duplicate normalized text key.");
          }

          var record = new JsonObject
          {
            ["locale"] = locale,
            ["text_key"] = textKey,
            ["text"] = text,
          };
          records.Add(record);
          texts.Add(textKey, text);
          evidence.Add(new SourceEvidenceRecord(
              CatalogCategories.RecordKey(CatalogCategory.Localizations, record),
              $"{table.Namespace}:{row.Key.Text}",
              [new SourceLocation(table.AssetPathWithoutExtension + ".uasset", row.Key.Text, "TextData")]));
        }
      }
    }

    return new LocalizationFacts(
        records,
        evidence,
        keysByLocale,
        textsByLocale,
        locales.Order(StringComparer.Ordinal).ToArray());
  }

  private static PalFacts ReadPals(DefaultFileProvider provider, LocalizationFacts localization)
  {
    var table = provider.LoadPackageObject<UDataTable>(PalTablePath);
    var iconTable = provider.LoadPackageObject<UDataTable>(PalIconTablePath);
    var palIdsWithIcons = iconTable.RowMap
        .Where(row => !row.Value.Get<FSoftObjectPath>("Icon").AssetPathName.Text.Contains("T_dummy_icon", StringComparison.OrdinalIgnoreCase))
        .Select(row => row.Key.Text)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    var records = new List<JsonObject>();
    var evidence = new List<SourceEvidenceRecord>();
    var excluded = new List<ExcludedRecord>();
    var unresolved = new List<UnresolvedRecord>();
    var facts = new List<PalFact>();
    var sourceOrder = 0;
    foreach (var row in table.RowMap)
    {
      var sourceName = row.Key.Text;
      var tribe = EnumTail(Name(row.Value, "Tribe"));
      var reason = PalExclusionReason(row.Value, sourceName, tribe, palIdsWithIcons);
      if (reason is not null)
      {
        excluded.Add(new ExcludedRecord("pals", sourceName, reason));
        continue;
      }

      var elementTypes = new[] { Name(row.Value, "ElementType1"), Name(row.Value, "ElementType2") }
          .Select(EnumTail)
          .Where(value => !StringComparer.OrdinalIgnoreCase.Equals(value, "None"))
          .Distinct(StringComparer.OrdinalIgnoreCase)
          .Select(StableIdV1.Normalize)
          .Order(StringComparer.Ordinal)
          .ToArray();
      if (elementTypes.Length == 0)
      {
        unresolved.Add(new UnresolvedRecord("pals", sourceName, "PAL_ELEMENT_UNRESOLVED"));
        continue;
      }

      var overrideName = Name(row.Value, "OverrideNameTextID");
      var rawNameKey = IsNone(overrideName) ? $"PAL_NAME_{sourceName}" : overrideName;
      var nameKey = localization.ResolveInEveryLocale(LocalizationKey("pal_name", rawNameKey));
      if (nameKey is null)
      {
        unresolved.Add(new UnresolvedRecord("pals", sourceName, "PAL_NAME_LOCALIZATION_MISSING"));
        continue;
      }

      var stableId = StableIdV1.Normalize(sourceName);
      var encyclopediaNo = Integer(row.Value, "ZukanIndex");
      var breedingPower = Integer(row.Value, "CombiRank");
      var priority = Integer(row.Value, "CombiDuplicatePriority");
      var suffix = Text(row.Value, "ZukanIndexSuffix");
      var bpClass = Name(row.Value, "BPClass");
      var record = EntityRecord(sourceName, new JsonObject
      {
        ["pal_id"] = stableId,
        ["encyclopedia_no"] = encyclopediaNo,
        ["name_key"] = nameKey,
        ["element_types"] = new JsonArray(elementTypes.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
        ["rarity"] = Integer(row.Value, "Rarity"),
        ["breeding_power"] = breedingPower,
      });
      records.Add(record);
      evidence.Add(Evidence(CatalogCategory.Pals, record, sourceName, PalTableAsset, sourceName,
          "ZukanIndex", "OverrideNameTextID", "ElementType1", "ElementType2", "Rarity", "CombiRank"));
      facts.Add(new PalFact(
          sourceName,
          stableId,
          tribe,
          breedingPower,
          priority,
          suffix.Length > 0,
          sourceOrder++,
          bpClass,
          Name(row.Value, "OverridePartnerSkillNameTextID"),
          Name(row.Value, "OverridePartnerSkillDescTextID")));
    }

    _ = StableIdV1.BuildMap(facts.Select(value => value.SourceName));
    return new PalFacts(
        facts,
        Result(records, evidence, excluded, unresolved));
  }

  private static ReaderResult ReadPassives(DefaultFileProvider provider, LocalizationFacts localization)
  {
    var table = provider.LoadPackageObject<UDataTable>(PassiveTablePath);
    var records = new List<JsonObject>();
    var evidence = new List<SourceEvidenceRecord>();
    var excluded = new List<ExcludedRecord>();
    var unresolved = new List<UnresolvedRecord>();
    foreach (var row in table.RowMap)
    {
      var sourceName = row.Key.Text;
      var category = Name(row.Value, "Category");
      if (!category.Contains("SortDisplayable", StringComparison.Ordinal) || sourceName.StartsWith("GYM_", StringComparison.OrdinalIgnoreCase))
      {
        excluded.Add(new ExcludedRecord("passive_skills", sourceName, "PASSIVE_NOT_DISPLAYABLE"));
        continue;
      }

      var overrideName = Name(row.Value, "OverrideNameTextID");
      var rawNameKey = IsNone(overrideName) ? $"PASSIVE_{sourceName}" : overrideName;
      var nameKey = localization.ResolveInEveryLocale(LocalizationKey("skill_name", rawNameKey));
      if (nameKey is null)
      {
        unresolved.Add(new UnresolvedRecord("passive_skills", sourceName, "PASSIVE_NAME_LOCALIZATION_MISSING"));
        continue;
      }

      var overrideDescription = Name(row.Value, "OverrideDescMsgID");
      var rawDescriptionKey = IsNone(overrideDescription) ? $"PASSIVE_{sourceName}" : overrideDescription;
      var descriptionTemplateKey = localization.ResolveInEveryLocale(LocalizationKey("skill_desc", rawDescriptionKey));
      var targetElement = EnumTail(Name(row.Value, "TargetElementType"));
      var normalizedTargetElement = IsNone(targetElement) ? null : StableIdV1.Normalize(targetElement);
      var effects = new List<PassiveEffectFact>();
      for (var slot = 1; slot <= 4; slot++)
      {
        var effectType = EnumTail(Name(row.Value, $"EffectType{slot}"));
        if (StringComparer.OrdinalIgnoreCase.Equals(effectType, "no"))
        {
          continue;
        }

        effects.Add(new PassiveEffectFact(
            slot,
            EnumTail(Name(row.Value, $"TargetType{slot}")),
            effectType,
            Single(row.Value, $"EffectValue{slot}"),
            normalizedTargetElement));
      }

      var stableId = StableIdV1.Normalize(sourceName);
      var descriptionKey = LocalizationKey("passive_resolved", stableId);
      foreach (var locale in localization.Locales)
      {
        var commonTexts = localization.NamespaceTexts(locale, "ui_common");
        var description = descriptionTemplateKey is not null
            ? PassiveDescriptionFormatter.FormatTemplate(
                localization.Text(locale, descriptionTemplateKey),
                effects,
                commonTexts)
            : PassiveDescriptionFormatter.BuildDefault(effects, commonTexts);
        localization.AddDerived(
            locale,
            descriptionKey,
            description,
            $"passive:{sourceName}",
            [
              new SourceLocation(PassiveTablePath + ".uasset", sourceName, "EffectType1..4"),
              new SourceLocation(PassiveTablePath + ".uasset", sourceName, "EffectValue1..4"),
              new SourceLocation(PassiveTablePath + ".uasset", sourceName, "OverrideDescMsgID"),
            ]);
      }

      var rank = Integer(row.Value, "Rank");
      var record = EntityRecord(sourceName, new JsonObject
      {
        ["passive_skill_id"] = stableId,
        ["name_key"] = nameKey,
        ["description_key"] = descriptionKey,
        ["description_template_key"] = descriptionTemplateKey is null ? null : JsonValue.Create(descriptionTemplateKey),
        ["effects"] = new JsonArray(effects.OrderBy(effect => effect.Slot).Select(effect =>
            (JsonNode)new JsonObject
            {
              ["slot"] = effect.Slot,
              ["target_type"] = StableIdV1.Normalize(effect.TargetType),
              ["effect_type"] = StableIdV1.Normalize(effect.EffectType),
              ["value"] = effect.Value,
              ["target_element_type"] = effect.TargetElementType is null
                  ? null
                  : JsonValue.Create(effect.TargetElementType),
            }).ToArray()),
        ["rank"] = rank,
        ["is_negative"] = rank < 0,
      });
      records.Add(record);
      evidence.Add(Evidence(CatalogCategory.PassiveSkills, record, sourceName, PassiveTablePath + ".uasset", sourceName,
          "Category", "OverrideNameTextID", "OverrideDescMsgID", "Rank", "TargetElementType",
          "TargetType1", "TargetType2", "TargetType3", "TargetType4",
          "EffectType1", "EffectType2", "EffectType3", "EffectType4",
          "EffectValue1", "EffectValue2", "EffectValue3", "EffectValue4"));
    }

    _ = StableIdV1.BuildMap(records.Select(record => record["metadata"]!["source_internal_name"]!.GetValue<string>()));
    return Result(records, evidence, excluded, unresolved);
  }

  private static ActiveFacts ReadActiveSkills(DefaultFileProvider provider, LocalizationFacts localization)
  {
    var master = provider.LoadPackageObject<UDataTable>(MasterLevelTablePath);
    var referenced = master.RowMap.Values
        .Select(row => EnumTail(Name(row, "WazaID")))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);
    var table = provider.LoadPackageObject<UDataTable>(ActiveTablePath);
    var records = new List<JsonObject>();
    var evidence = new List<SourceEvidenceRecord>();
    var excluded = new List<ExcludedRecord>();
    var unresolved = new List<UnresolvedRecord>();
    var facts = new Dictionary<string, ActiveFact>(StringComparer.OrdinalIgnoreCase);
    foreach (var row in table.RowMap)
    {
      var sourceRow = row.Key.Text;
      var wazaId = EnumTail(Name(row.Value, "WazaType"));
      if (Boolean(row.Value, "DisabledData"))
      {
        excluded.Add(new ExcludedRecord("active_skills", sourceRow, "ACTIVE_SKILL_DISABLED"));
        continue;
      }

      if (!referenced.Contains(wazaId))
      {
        excluded.Add(new ExcludedRecord("active_skills", sourceRow, "ACTIVE_SKILL_UNREFERENCED"));
        continue;
      }

      var nameKey = localization.ResolveInEveryLocale(LocalizationKey("skill_name", $"ACTION_SKILL_{wazaId}"));
      if (nameKey is null)
      {
        excluded.Add(new ExcludedRecord("active_skills", sourceRow, "ACTIVE_SKILL_NOT_CATALOG_VISIBLE"));
        continue;
      }

      var fact = new ActiveFact(
          wazaId,
          StableIdV1.Normalize(wazaId),
          sourceRow,
          StableIdV1.Normalize(EnumTail(Name(row.Value, "Element"))),
          Integer(row.Value, "Power"),
          Single(row.Value, "CoolTime"),
          Boolean(row.Value, "IgnoreRandomInherit"));
      if (facts.TryGetValue(wazaId, out var previous))
      {
        if (previous.ElementType != fact.ElementType
            || previous.Power != fact.Power
            || previous.CooldownSeconds != fact.CooldownSeconds
            || previous.IsExclusive != fact.IsExclusive)
        {
          unresolved.Add(new UnresolvedRecord("active_skills", wazaId, "ACTIVE_SKILL_CONFLICT"));
        }
        else
        {
          excluded.Add(new ExcludedRecord("active_skills", sourceRow, "ACTIVE_SKILL_DUPLICATE_ROW"));
        }

        continue;
      }

      facts.Add(wazaId, fact);
      var record = EntityRecord(wazaId, new JsonObject
      {
        ["active_skill_id"] = fact.StableId,
        ["name_key"] = nameKey,
        ["element_type"] = fact.ElementType,
        ["power"] = fact.Power,
        ["cooldown_seconds"] = (double)fact.CooldownSeconds,
      });
      records.Add(record);
      evidence.Add(Evidence(CatalogCategory.ActiveSkills, record, wazaId, ActiveTablePath + ".uasset", sourceRow,
          "WazaType", "Element", "Power", "CoolTime", "DisabledData", "IgnoreRandomInherit"));
    }

    _ = StableIdV1.BuildMap(facts.Values.Select(value => value.SourceName));
    return new ActiveFacts(facts, Result(records, evidence, excluded, unresolved));
  }

  private static ReaderResult ReadPalActiveSkills(
      DefaultFileProvider provider,
      IReadOnlyList<PalFact> pals,
      IReadOnlyDictionary<string, ActiveFact> active)
  {
    var table = provider.LoadPackageObject<UDataTable>(MasterLevelTablePath);
    var palBySource = pals.ToDictionary(value => value.SourceName, StringComparer.OrdinalIgnoreCase);
    var records = new List<JsonObject>();
    var evidence = new List<SourceEvidenceRecord>();
    var excluded = new List<ExcludedRecord>();
    var unresolved = new List<UnresolvedRecord>();
    var keys = new HashSet<string>(StringComparer.Ordinal);
    foreach (var row in table.RowMap)
    {
      var sourceRow = row.Key.Text;
      var palSource = Name(row.Value, "PalId");
      var wazaSource = EnumTail(Name(row.Value, "WazaID"));
      if (!palBySource.TryGetValue(palSource, out var pal))
      {
        excluded.Add(new ExcludedRecord("pal_active_skills", sourceRow, "PAL_ACTIVE_PAL_NOT_RELEASED"));
        continue;
      }

      if (!active.TryGetValue(wazaSource, out var skill))
      {
        excluded.Add(new ExcludedRecord("pal_active_skills", sourceRow, "PAL_ACTIVE_SKILL_NOT_CATALOG_VISIBLE"));
        continue;
      }

      var level = Integer(row.Value, "Level");
      var sourceName = $"{palSource}.{wazaSource}.{level}";
      var record = EntityRecord(sourceName, new JsonObject
      {
        ["pal_id"] = pal.StableId,
        ["active_skill_id"] = skill.StableId,
        ["learn_level"] = level,
        ["is_exclusive"] = skill.IsExclusive,
      });
      var key = CatalogCategories.RecordKey(CatalogCategory.PalActiveSkills, record);
      if (!keys.Add(key))
      {
        excluded.Add(new ExcludedRecord("pal_active_skills", sourceRow, "PAL_ACTIVE_DUPLICATE_ROW"));
        continue;
      }

      records.Add(record);
      evidence.Add(new SourceEvidenceRecord(
          key,
          sourceName,
          [
            new SourceLocation(MasterLevelTablePath + ".uasset", sourceRow, "PalId"),
            new SourceLocation(MasterLevelTablePath + ".uasset", sourceRow, "WazaID"),
            new SourceLocation(MasterLevelTablePath + ".uasset", sourceRow, "Level"),
            new SourceLocation(ActiveTablePath + ".uasset", skill.SourceRow, "IgnoreRandomInherit"),
          ]));
    }

    return Result(records, evidence, excluded, unresolved);
  }

  private static ReaderResult ReadPartnerSkills(
      DefaultFileProvider provider,
      IReadOnlyList<PalFact> pals,
      LocalizationFacts localization)
  {
    var parameterTable = provider.LoadPackageObject<UDataTable>(PartnerParameterTablePath);
    var parameterRows = parameterTable.RowMap.Keys.Select(value => value.Text).ToHashSet(StringComparer.OrdinalIgnoreCase);
    var blueprintFiles = provider.Files.Keys
        .Where(path => path.StartsWith(BlueprintBasePath, StringComparison.OrdinalIgnoreCase)
            && path.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase))
        .ToArray();
    var records = new List<JsonObject>();
    var evidence = new List<SourceEvidenceRecord>();
    var excluded = new List<ExcludedRecord>();
    var unresolved = new List<UnresolvedRecord>();
    foreach (var pal in pals)
    {
      var rawNameKey = IsNone(pal.PartnerNameOverride) ? $"PARTNERSKILL_{pal.SourceName}" : pal.PartnerNameOverride;
      var nameKey = localization.ResolveInEveryLocale(LocalizationKey("skill_name", rawNameKey));
      if (nameKey is null)
      {
        excluded.Add(new ExcludedRecord("partner_skills", pal.SourceName, "PARTNER_SKILL_NOT_DEFINED"));
        continue;
      }

      if (!parameterRows.Contains(pal.SourceName))
      {
        unresolved.Add(new UnresolvedRecord("partner_skills", pal.SourceName, "PARTNER_PARAMETER_ROW_MISSING"));
        continue;
      }

      var expectedFileName = $"BP_{pal.BpClass}.uasset";
      var blueprintPath = blueprintFiles
          .Where(path => path.EndsWith('/' + expectedFileName, StringComparison.OrdinalIgnoreCase))
          .Order(StringComparer.Ordinal)
          .FirstOrDefault();
      if (blueprintPath is null)
      {
        unresolved.Add(new UnresolvedRecord("partner_skills", pal.SourceName, "PARTNER_BLUEPRINT_MISSING"));
        continue;
      }

      var rawDescriptionKey = pal.PartnerDescriptionOverride;
      var descriptionKey = IsNone(rawDescriptionKey)
          ? null
          : localization.ResolveInEveryLocale(LocalizationKey("skill_desc", rawDescriptionKey));
      if (!IsNone(rawDescriptionKey) && descriptionKey is null)
      {
        unresolved.Add(new UnresolvedRecord("partner_skills", pal.SourceName, "PARTNER_DESCRIPTION_LOCALIZATION_MISSING"));
        continue;
      }

      var sourceName = rawNameKey;
      var record = EntityRecord(sourceName, new JsonObject
      {
        ["partner_skill_id"] = StableIdV1.Normalize(sourceName),
        ["pal_id"] = pal.StableId,
        ["name_key"] = nameKey,
        ["description_key"] = descriptionKey,
      });
      records.Add(record);
      evidence.Add(new SourceEvidenceRecord(
          CatalogCategories.RecordKey(CatalogCategory.PartnerSkills, record),
          sourceName,
          [
            new SourceLocation(PalTableAsset, pal.SourceName, "BPClass"),
            new SourceLocation(PalTableAsset, pal.SourceName, "OverridePartnerSkillNameTextID"),
            new SourceLocation(PalTableAsset, pal.SourceName, "OverridePartnerSkillDescTextID"),
            new SourceLocation(PartnerParameterTablePath + ".uasset", pal.SourceName, "ActiveSkill"),
            new SourceLocation(blueprintPath, $"BP_{pal.BpClass}_C", "SimpleConstructionScript"),
          ]));
    }

    _ = StableIdV1.BuildMap(records.Select(record => record["metadata"]!["source_internal_name"]!.GetValue<string>()));
    return Result(records, evidence, excluded, unresolved);
  }

  private static ReaderResult ReadBreedingRecipes(DefaultFileProvider provider, IReadOnlyList<PalFact> pals)
  {
    var table = provider.LoadPackageObject<UDataTable>(UniqueBreedingTablePath);
    var palBySource = pals.ToDictionary(value => value.SourceName, StringComparer.OrdinalIgnoreCase);
    var palsByTribe = pals
        .GroupBy(value => value.Tribe, StringComparer.OrdinalIgnoreCase)
        .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.OrdinalIgnoreCase);
    var combinations = new List<SpecialCombination>();
    var excluded = new List<ExcludedRecord>();
    var unresolved = new List<UnresolvedRecord>();
    foreach (var row in table.RowMap)
    {
      var parentATribe = EnumTail(Name(row.Value, "ParentTribeA"));
      var parentBTribe = EnumTail(Name(row.Value, "ParentTribeB"));
      var childSource = Name(row.Value, "ChildCharacterID");
      if (!palsByTribe.TryGetValue(parentATribe, out var parentACandidates)
          || !palsByTribe.TryGetValue(parentBTribe, out var parentBCandidates)
          || !palBySource.TryGetValue(childSource, out var child))
      {
        excluded.Add(new ExcludedRecord("breeding_recipes", row.Key.Text, "SPECIAL_COMBINATION_NOT_RELEASED"));
        continue;
      }

      if (parentACandidates.Length != 1 || parentBCandidates.Length != 1)
      {
        unresolved.Add(new UnresolvedRecord("breeding_recipes", row.Key.Text, "SPECIAL_PARENT_TRIBE_AMBIGUOUS"));
        continue;
      }

      var parentA = parentACandidates[0];
      var parentB = parentBCandidates[0];

      var genderA = Gender(Name(row.Value, "ParentGenderA"));
      var genderB = Gender(Name(row.Value, "ParentGenderB"));
      combinations.Add(new SpecialCombination(row.Key.Text, parentA, genderA, parentB, genderB, child));
    }

    var specialChildren = combinations.Select(value => value.Child.StableId).ToHashSet(StringComparer.Ordinal);
    var normalCandidates = pals.Where(value => !specialChildren.Contains(value.StableId)).ToArray();
    var records = new List<JsonObject>();
    var evidence = new List<SourceEvidenceRecord>();
    var orderedPals = pals.OrderBy(value => value.StableId, StringComparer.Ordinal).ToArray();
    for (var aIndex = 0; aIndex < orderedPals.Length; aIndex++)
    {
      for (var bIndex = aIndex; bIndex < orderedPals.Length; bIndex++)
      {
        var parentA = orderedPals[aIndex];
        var parentB = orderedPals[bIndex];
        if (StringComparer.Ordinal.Equals(parentA.StableId, parentB.StableId))
        {
          AddRecipe(records, evidence, parentA, "any", parentB, "any", parentA, "normal", null);
          continue;
        }

        var pairCombinations = combinations.Where(value => value.HasParents(parentA, parentB)).ToArray();
        var orientations = new[] { (A: "female", B: "male"), (A: "male", B: "female") };
        var results = new List<BreedingOutcome>();
        foreach (var orientation in orientations)
        {
          if (pairCombinations.Length > 0)
          {
            var matching = pairCombinations.Where(value => value.Matches(parentA, orientation.A, parentB, orientation.B)).ToArray();
            if (matching.Length != 1)
            {
              unresolved.Add(new UnresolvedRecord(
                  "breeding_recipes",
                  $"{parentA.SourceName}:{orientation.A}|{parentB.SourceName}:{orientation.B}",
                  "BREEDING_RECIPE_CONFLICT"));
              continue;
            }

            results.Add(new BreedingOutcome(orientation.A, orientation.B, matching[0].Child, "special", matching[0]));
          }
          else
          {
            var targetPower = (int)Math.Floor((parentA.BreedingPower + parentB.BreedingPower + 1) / 2.0f);
            var child = normalCandidates
                .OrderBy(value => Math.Abs(value.BreedingPower - targetPower))
                .ThenByDescending(value => value.BreedingPriority)
                .ThenBy(value => value.IsVariant ? 1 : 0)
                .ThenBy(value => value.SourceOrder)
                .First();
            results.Add(new BreedingOutcome(orientation.A, orientation.B, child, "normal", null));
          }
        }

        if (results.Count != orientations.Length)
        {
          continue;
        }

        if (results.Select(value => (value.Child.StableId, value.RecipeType)).Distinct().Count() == 1)
        {
          AddRecipe(records, evidence, parentA, "any", parentB, "any", results[0].Child, results[0].RecipeType, results[0].Combination);
        }
        else
        {
          foreach (var outcome in results)
          {
            AddRecipe(records, evidence, parentA, outcome.GenderA, parentB, outcome.GenderB, outcome.Child, outcome.RecipeType, outcome.Combination);
          }
        }
      }
    }

    var duplicate = records
        .GroupBy(record => CatalogCategories.RecordKey(CatalogCategory.BreedingRecipes, record), StringComparer.Ordinal)
        .FirstOrDefault(group => group.Count() > 1);
    if (duplicate is not null)
    {
      unresolved.Add(new UnresolvedRecord("breeding_recipes", duplicate.Key, "BREEDING_RECIPE_CONFLICT"));
    }

    return Result(records, evidence, excluded, unresolved);
  }

  private static void AddRecipe(
      List<JsonObject> records,
      List<SourceEvidenceRecord> evidence,
      PalFact parentA,
      string genderA,
      PalFact parentB,
      string genderB,
      PalFact child,
      string recipeType,
      SpecialCombination? combination)
  {
    var sourceName = combination is null
        ? $"normal:{parentA.SourceName}:{parentB.SourceName}:{genderA}:{genderB}"
        : $"special:{combination.SourceRow}:{genderA}:{genderB}";
    var record = EntityRecord(sourceName, new JsonObject
    {
      ["parent_a_pal_id"] = parentA.StableId,
      ["parent_a_gender"] = genderA,
      ["parent_b_pal_id"] = parentB.StableId,
      ["parent_b_gender"] = genderB,
      ["child_pal_id"] = child.StableId,
      ["recipe_type"] = recipeType,
    });
    records.Add(record);
    var sources = combination is null
        ? new[]
        {
          new SourceLocation(PalTableAsset, parentA.SourceName, "CombiRank"),
          new SourceLocation(PalTableAsset, parentB.SourceName, "CombiRank"),
          new SourceLocation(PalTableAsset, child.SourceName, "CombiRank"),
          new SourceLocation(PalTableAsset, child.SourceName, "CombiDuplicatePriority"),
        }
        : new[]
        {
          new SourceLocation(UniqueBreedingTablePath + ".uasset", combination.SourceRow, "ParentTribeA"),
          new SourceLocation(UniqueBreedingTablePath + ".uasset", combination.SourceRow, "ParentGenderA"),
          new SourceLocation(UniqueBreedingTablePath + ".uasset", combination.SourceRow, "ParentTribeB"),
          new SourceLocation(UniqueBreedingTablePath + ".uasset", combination.SourceRow, "ParentGenderB"),
          new SourceLocation(UniqueBreedingTablePath + ".uasset", combination.SourceRow, "ChildCharacterID"),
        };
    evidence.Add(new SourceEvidenceRecord(
        CatalogCategories.RecordKey(CatalogCategory.BreedingRecipes, record),
        sourceName,
        sources));
  }

  private static string? PalExclusionReason(
      FStructFallback row,
      string sourceName,
      string tribe,
      HashSet<string> palIdsWithIcons)
  {
    if (!Boolean(row, "IsPal")) return "NOT_A_PAL";
    if (Boolean(row, "IsBoss") || Boolean(row, "IsRaidBoss") || Boolean(row, "IsTowerBoss")) return "BOSS_VARIANT";
    if (sourceName.Contains("Quest", StringComparison.OrdinalIgnoreCase)) return "QUEST_VARIANT";
    if (sourceName.Contains("PREDATOR", StringComparison.OrdinalIgnoreCase)) return "RAMPAGING_VARIANT";
    if (sourceName.Contains("POLICE", StringComparison.OrdinalIgnoreCase)) return "POLICE_VARIANT";
    if (sourceName.StartsWith("GYM_", StringComparison.OrdinalIgnoreCase)) return "GYM_VARIANT";
    if (sourceName.StartsWith("SUMMON_", StringComparison.OrdinalIgnoreCase)) return "SUMMON_VARIANT";
    if (sourceName.EndsWith("_Oilrig", StringComparison.OrdinalIgnoreCase)) return "OILRIG_VARIANT";
    if (!palIdsWithIcons.Contains(sourceName) && !palIdsWithIcons.Contains(tribe)) return "PAL_ICON_MISSING";
    if (Integer(row, "ZukanIndex") <= 0) return "PALDEX_NOT_RELEASED";
    if (Integer(row, "Rarity") <= 0 || Integer(row, "RunSpeed") <= 0 || Integer(row, "WalkSpeed") <= 0 || Integer(row, "CombiRank") <= 0)
    {
      return "PAL_CONFIGURATION_INCOMPLETE";
    }

    return null;
  }

  private static ItemFacts ReadItems(DefaultFileProvider provider, LocalizationFacts localization)
  {
    var table = provider.LoadPackageObject<UDataTable>(ItemTablePath);
    var redirects = ReadItemRedirects(provider);
    var records = new List<JsonObject>();
    var evidence = new List<SourceEvidenceRecord>();
    var excluded = new List<ExcludedRecord>();
    var unresolved = new List<UnresolvedRecord>();
    var facts = new Dictionary<string, ItemFact>(StringComparer.OrdinalIgnoreCase);
    foreach (var row in table.RowMap.OrderBy(value => value.Key.Text, StringComparer.Ordinal))
    {
      var sourceName = row.Key.Text;
      if (!Boolean(row.Value, "bLegalInGame"))
      {
        excluded.Add(new ExcludedRecord("items", sourceName, "ITEM_NOT_LEGAL_IN_GAME"));
        continue;
      }

      var overrideName = Name(row.Value, "OverrideName");
      var rawNameKey = IsNone(overrideName) ? $"ITEM_NAME_{sourceName}" : overrideName;
      var nameKey = localization.ResolveInEveryLocale(LocalizationKey("item_name", rawNameKey));
      if (nameKey is null)
      {
        unresolved.Add(new UnresolvedRecord("items", sourceName, "ITEM_NAME_LOCALIZATION_MISSING"));
        continue;
      }

      var overrideDescription = Name(row.Value, "OverrideDescription");
      var rawDescriptionKey = IsNone(overrideDescription) ? $"ITEM_DESC_{sourceName}" : overrideDescription;
      var descriptionKey = localization.ResolveInEveryLocale(LocalizationKey("item_desc", rawDescriptionKey));
      var maxStackCount = Integer(row.Value, "MaxStackCount");
      if (maxStackCount <= 0)
      {
        unresolved.Add(new UnresolvedRecord("items", sourceName, "ITEM_MAX_STACK_INVALID"));
        continue;
      }

      var typeA = StableIdV1.Normalize(EnumTail(Name(row.Value, "TypeA")));
      var typeB = StableIdV1.Normalize(EnumTail(Name(row.Value, "TypeB")));
      var enableHandcraft = Boolean(row.Value, "bEnableHandcraft");
      var stableId = StableIdV1.Normalize(sourceName);
      var legacyIds = redirects.ByDestination.TryGetValue(sourceName, out var destinationRedirects)
          ? destinationRedirects.Select(value => StableIdV1.Normalize(value.SourceId)).Order(StringComparer.Ordinal).ToArray()
          : [];
      var record = EntityRecord(sourceName, new JsonObject
      {
        ["item_id"] = stableId,
        ["name_key"] = nameKey,
        ["description_key"] = descriptionKey is null ? null : JsonValue.Create(descriptionKey),
        ["type_a"] = typeA,
        ["type_b"] = typeB,
        ["max_stack_count"] = maxStackCount,
        ["enable_handcraft"] = enableHandcraft,
        ["is_legal"] = true,
        ["restore_health"] = Integer(row.Value, "RestoreHealth"),
        ["restore_sanity"] = Integer(row.Value, "RestoreSanity"),
        ["restore_satiety"] = Integer(row.Value, "RestoreSatiety"),
        ["corruption_factor"] = Single(row.Value, "CorruptionFactor"),
        ["legacy_item_ids"] = new JsonArray(legacyIds.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
      });
      records.Add(record);
      var locations = new List<SourceLocation>
      {
        new(ItemTablePath + ".uasset", sourceName, "bLegalInGame"),
        new(ItemTablePath + ".uasset", sourceName, "OverrideName"),
        new(ItemTablePath + ".uasset", sourceName, "OverrideDescription"),
        new(ItemTablePath + ".uasset", sourceName, "TypeA"),
        new(ItemTablePath + ".uasset", sourceName, "TypeB"),
        new(ItemTablePath + ".uasset", sourceName, "MaxStackCount"),
        new(ItemTablePath + ".uasset", sourceName, "bEnableHandcraft"),
        new(ItemTablePath + ".uasset", sourceName, "RestoreHealth"),
        new(ItemTablePath + ".uasset", sourceName, "RestoreSanity"),
        new(ItemTablePath + ".uasset", sourceName, "RestoreSatiety"),
        new(ItemTablePath + ".uasset", sourceName, "CorruptionFactor"),
      };
      if (destinationRedirects is not null)
      {
        locations.AddRange(destinationRedirects.SelectMany(value => new[]
        {
          new SourceLocation(ItemRedirectTablePath + ".uasset", value.SourceRow, "SourceItemIds"),
          new SourceLocation(ItemRedirectTablePath + ".uasset", value.SourceRow, "DestinationItemId.StaticId"),
        }));
      }
      evidence.Add(new SourceEvidenceRecord(
          CatalogCategories.RecordKey(CatalogCategory.Items, record),
          sourceName,
          locations));
      facts.Add(sourceName, new ItemFact(sourceName, stableId, typeA, typeB, enableHandcraft));
    }

    _ = StableIdV1.BuildMap(facts.Keys.Concat(redirects.BySource.Keys));
    foreach (var redirect in redirects.BySource.Values.OrderBy(value => value.SourceId, StringComparer.Ordinal))
    {
      if (!facts.TryGetValue(redirect.DestinationId, out var destination))
      {
        unresolved.Add(new UnresolvedRecord("items", redirect.SourceRow, "ITEM_REDIRECT_DESTINATION_MISSING"));
        continue;
      }
      if (facts.TryGetValue(redirect.SourceId, out var existing)
          && !StringComparer.Ordinal.Equals(existing.StableId, destination.StableId))
      {
        unresolved.Add(new UnresolvedRecord("items", redirect.SourceRow, "ITEM_REDIRECT_SOURCE_CONFLICT"));
        continue;
      }
      facts[redirect.SourceId] = destination;
    }
    return new ItemFacts(facts, Result(records, evidence, excluded, unresolved));
  }

  private static ItemRedirects ReadItemRedirects(DefaultFileProvider provider)
  {
    var table = provider.LoadPackageObject<UDataTable>(ItemRedirectTablePath);
    var bySource = new Dictionary<string, ItemRedirect>(StringComparer.OrdinalIgnoreCase);
    var byDestination = new Dictionary<string, List<ItemRedirect>>(StringComparer.OrdinalIgnoreCase);
    foreach (var row in table.RowMap.OrderBy(value => value.Key.Text, StringComparer.Ordinal))
    {
      var destination = Property(row.Value, "DestinationItemId").Tag!.GetValue<FStructFallback>()
          ?? throw new ExtractorException(
              ErrorCodes.UnresolvedGameFacts,
              "An item redirect destination is null.");
      var destinationId = Name(destination, "StaticId");
      foreach (var sourceId in Names(row.Value, "SourceItemIds").Where(value => !IsNone(value)))
      {
        var redirect = new ItemRedirect(row.Key.Text, sourceId, destinationId);
        if (!bySource.TryAdd(sourceId, redirect))
        {
          throw new ExtractorException(
              ErrorCodes.UnresolvedGameFacts,
              "A source item ID occurs in more than one redirect row.");
        }
        if (!byDestination.TryGetValue(destinationId, out var destinationValues))
        {
          destinationValues = [];
          byDestination.Add(destinationId, destinationValues);
        }
        destinationValues.Add(redirect);
      }
    }
    return new ItemRedirects(bySource, byDestination);
  }

  private static ReaderResult ReadItemRecipes(
      DefaultFileProvider provider,
      IReadOnlyDictionary<string, ItemFact> items)
  {
    var table = provider.LoadPackageObject<UDataTable>(ItemRecipeTablePath);
    var records = new List<JsonObject>();
    var evidence = new List<SourceEvidenceRecord>();
    var excluded = new List<ExcludedRecord>();
    var unresolved = new List<UnresolvedRecord>();
    foreach (var row in table.RowMap.OrderBy(value => value.Key.Text, StringComparer.Ordinal))
    {
      var sourceName = row.Key.Text;
      var productSource = Name(row.Value, "Product_Id");
      if (IsNone(productSource) || !items.TryGetValue(productSource, out var product))
      {
        excluded.Add(new ExcludedRecord("item_recipes", sourceName, "RECIPE_PRODUCT_NOT_IN_LEGAL_CATALOG"));
        continue;
      }

      var productCount = Integer(row.Value, "Product_Count");
      var ingredients = new JsonArray();
      var referencesAreValid = productCount > 0;
      for (var slot = 1; slot <= 5; slot++)
      {
        var materialSource = Name(row.Value, $"Material{slot}_Id");
        var materialCount = Integer(row.Value, $"Material{slot}_Count");
        if (IsNone(materialSource) && materialCount == 0)
        {
          continue;
        }

        if (IsNone(materialSource)
            || materialCount <= 0
            || !items.TryGetValue(materialSource, out var material))
        {
          referencesAreValid = false;
          break;
        }

        ingredients.Add(new JsonObject
        {
          ["slot"] = slot,
          ["item_id"] = material.StableId,
          ["count"] = materialCount,
        });
      }

      if (!referencesAreValid || ingredients.Count == 0)
      {
        excluded.Add(new ExcludedRecord("item_recipes", sourceName, "RECIPE_MATERIALS_NOT_IN_LEGAL_CATALOG"));
        continue;
      }

      var unlockSource = Name(row.Value, "UnlockItemID");
      JsonNode? unlockItemId = null;
      if (!IsNone(unlockSource))
      {
        if (!items.TryGetValue(unlockSource, out var unlockItem))
        {
          excluded.Add(new ExcludedRecord("item_recipes", sourceName, "RECIPE_UNLOCK_ITEM_NOT_IN_LEGAL_CATALOG"));
          continue;
        }

        unlockItemId = JsonValue.Create(unlockItem.StableId);
      }

      var denyRecipeChain = new JsonArray();
      var denyReferencesValid = true;
      foreach (var deniedSource in Names(row.Value, "DenyRecipeChain"))
      {
        if (!items.TryGetValue(deniedSource, out var deniedItem))
        {
          denyReferencesValid = false;
          break;
        }

        denyRecipeChain.Add(deniedItem.StableId);
      }

      if (!denyReferencesValid)
      {
        excluded.Add(new ExcludedRecord("item_recipes", sourceName, "RECIPE_DENY_CHAIN_ITEM_NOT_IN_LEGAL_CATALOG"));
        continue;
      }

      var orderedDenyRecipeChain = new JsonArray(denyRecipeChain
          .Select(value => value!.GetValue<string>())
          .Distinct(StringComparer.Ordinal)
          .Order(StringComparer.Ordinal)
          .Select(value => (JsonNode?)JsonValue.Create(value))
          .ToArray());
      var energyType = EnumTail(Name(row.Value, "EnergyType"));
      var isFood = product.TypeA.Contains("food", StringComparison.OrdinalIgnoreCase)
          || product.TypeB.Contains("food", StringComparison.OrdinalIgnoreCase);
      var record = EntityRecord(sourceName, new JsonObject
      {
        ["recipe_id"] = StableIdV1.Normalize(sourceName),
        ["product_item_id"] = product.StableId,
        ["product_count"] = productCount,
        ["ingredients"] = ingredients,
        ["craft_kind"] = isFood ? "cooking" : product.EnableHandcraft ? "handcraft" : "other",
        ["work_amount"] = Single(row.Value, "WorkAmount"),
        ["workable_attribute"] = Integer(row.Value, "WorkableAttribute"),
        ["energy_type"] = IsNone(energyType) ? null : JsonValue.Create(StableIdV1.Normalize(energyType)),
        ["energy_amount"] = Integer(row.Value, "EnergyAmount"),
        ["unlock_item_id"] = unlockItemId,
        ["deny_recipe_chain"] = orderedDenyRecipeChain,
      });
      records.Add(record);
      evidence.Add(Evidence(
          CatalogCategory.ItemRecipes,
          record,
          sourceName,
          ItemRecipeTablePath + ".uasset",
          sourceName,
          "Product_Id",
          "Product_Count",
          "Material1_Id",
          "Material1_Count",
          "Material2_Id",
          "Material2_Count",
          "Material3_Id",
          "Material3_Count",
          "Material4_Id",
          "Material4_Count",
          "Material5_Id",
          "Material5_Count",
          "WorkAmount",
          "WorkableAttribute",
          "EnergyType",
          "EnergyAmount",
          "UnlockItemID",
          "DenyRecipeChain"));
    }

    if (unresolved.Count > 0)
    {
      return Result(records, evidence, excluded, unresolved);
    }

    return Result(records, evidence, excluded);
  }

  private static IEnumerable<LocalizationTable> LocalizationTables(string locale)
  {
    var root = locale switch
    {
      "en-US" => "Pal/Content/L10N/en/Pal/DataTable/Text",
      "ja-JP" => "Pal/Content/Pal/DataTable/Text",
      "zh-CN" => "Pal/Content/L10N/zh-Hans/Pal/DataTable/Text",
      _ => throw new ExtractorException(ErrorCodes.ConfigurationInvalid, "The requested locale has no confirmed asset mapping."),
    };
    return
    [
      new LocalizationTable("pal_name", $"{root}/DT_PalNameText_Common"),
      new LocalizationTable("skill_name", $"{root}/DT_SkillNameText_Common"),
      new LocalizationTable("skill_desc", $"{root}/DT_SkillDescText_Common"),
      new LocalizationTable("partner_append", $"{root}/DT_PartnerSkillAppendText"),
      new LocalizationTable("item_name", $"{root}/DT_ItemNameText_Common"),
      new LocalizationTable("item_desc", $"{root}/DT_ItemDescriptionText_Common"),
      new LocalizationTable("ui_common", $"{root}/DT_UI_Common_Text_Common"),
    ];
  }

  private static JsonObject EntityRecord(string sourceName, JsonObject record)
  {
    record["metadata"] = new JsonObject { ["source_internal_name"] = sourceName };
    return record;
  }

  private static SourceEvidenceRecord Evidence(
      CatalogCategory category,
      JsonObject record,
      string sourceName,
      string assetPath,
      string rowName,
      params string[] propertyChains) => new(
          CatalogCategories.RecordKey(category, record),
          sourceName,
          propertyChains.Select(property => new SourceLocation(assetPath, rowName, property)).ToArray());

  private static ReaderResult Result(
      IReadOnlyList<JsonObject> records,
      IReadOnlyList<SourceEvidenceRecord> evidence,
      IReadOnlyList<ExcludedRecord>? excluded = null,
      IReadOnlyList<UnresolvedRecord>? unresolved = null) => new(
          records,
          evidence,
          excluded ?? [],
          unresolved ?? [],
          []);

  private static FPropertyTag Property(FStructFallback row, string name) => row.Properties.SingleOrDefault(value => value.Name.Text == name)
      ?? throw new ExtractorException(ErrorCodes.UnresolvedGameFacts, $"Confirmed source property is missing: {name}");

  private static string Name(FStructFallback row, string name) => Property(row, name).Tag!.GetValue<FName>().Text;

  private static string Text(FStructFallback row, string name) => Property(row, name).Tag!.GetValue<string>()
      ?? throw new ExtractorException(ErrorCodes.UnresolvedGameFacts, $"Confirmed source text property is null: {name}");

  private static int Integer(FStructFallback row, string name) => Property(row, name).Tag!.GetValue<int>();

  private static float Single(FStructFallback row, string name) => Property(row, name).Tag!.GetValue<float>();

  private static string[] Names(FStructFallback row, string name) =>
      Property(row, name).Tag!.GetValue<List<FName>>()?.Select(value => value.Text).ToArray()
      ?? throw new ExtractorException(ErrorCodes.UnresolvedGameFacts, $"Confirmed source name array is null: {name}");

  private static bool Boolean(FStructFallback row, string name) => Property(row, name).Tag!.GetValue<bool>();

  internal static string EnumTail(string value)
  {
    var separator = value.LastIndexOf("::", StringComparison.Ordinal);
    return separator < 0 ? value : value[(separator + 2)..];
  }

  internal static string Gender(string value) => EnumTail(value) switch
  {
    "None" => "any",
    "Female" => "female",
    "Male" => "male",
    _ => throw new ExtractorException(ErrorCodes.UnresolvedGameFacts, "Unknown breeding gender enum value."),
  };

  internal static string LocalizationKey(string sourceNamespace, string rawKey)
  {
    if (rawKey.All(IsTextKeyCharacter))
    {
      return $"{sourceNamespace}.{rawKey}";
    }

    var readable = new string(rawKey.Select(character => IsTextKeyCharacter(character) ? character : '_').ToArray());
    if (readable.Length > 140)
    {
      readable = readable[..140];
    }

    return $"{sourceNamespace}.{readable}.{Hashing.Sha256(rawKey)[..16]}";
  }

  private static bool IsTextKeyCharacter(char value) => value is >= 'A' and <= 'Z'
      or >= 'a' and <= 'z'
      or >= '0' and <= '9'
      or '.' or '_' or '-';

  private static bool IsNone(string? value) => string.IsNullOrWhiteSpace(value)
      || StringComparer.OrdinalIgnoreCase.Equals(value, "None");

  private sealed class SnapshotCatalogReader(CatalogCategory category, ReaderResult result) : ICatalogReader
  {
    public CatalogCategory Category { get; } = category;

    public Task<ReaderResult> ReadAsync(CancellationToken cancellationToken)
    {
      cancellationToken.ThrowIfCancellationRequested();
      return Task.FromResult(result);
    }
  }

  private sealed record LocalizationTable(string Namespace, string AssetPathWithoutExtension);

  private sealed record LocalizationFacts(
      List<JsonObject> Records,
      List<SourceEvidenceRecord> EvidenceRecords,
      IReadOnlyDictionary<string, HashSet<string>> KeysByLocale,
      IReadOnlyDictionary<string, Dictionary<string, string>> TextsByLocale,
      IReadOnlyList<string> Locales)
  {
    public ReaderResult ToReaderResult() => Result(Records, EvidenceRecords);

    public string? ResolveInEveryLocale(string requestedKey)
    {
      var canonical = KeysByLocale[Locales[0]]
          .SingleOrDefault(key => StringComparer.OrdinalIgnoreCase.Equals(key, requestedKey));
      return canonical is not null
          && Locales.All(locale => KeysByLocale[locale].Any(key => StringComparer.OrdinalIgnoreCase.Equals(key, canonical)))
          ? canonical
          : null;
    }

    public string Text(string locale, string textKey) =>
        TextsByLocale[locale].TryGetValue(textKey, out var text)
            ? text
            : throw new ExtractorException(
                ErrorCodes.UnresolvedGameFacts,
                "A confirmed localization key is missing from one locale.");

    public Dictionary<string, string> NamespaceTexts(string locale, string sourceNamespace)
    {
      var prefix = sourceNamespace + ".";
      return TextsByLocale[locale]
          .Where(pair => pair.Key.StartsWith(prefix, StringComparison.Ordinal))
          .ToDictionary(pair => pair.Key[prefix.Length..], pair => pair.Value, StringComparer.Ordinal);
    }

    public void AddDerived(
        string locale,
        string textKey,
        string text,
        string sourceInternalName,
        IReadOnlyList<SourceLocation> sources)
    {
      if (string.IsNullOrWhiteSpace(text) || !KeysByLocale[locale].Add(textKey))
      {
        throw new ExtractorException(
            ErrorCodes.GameIdNormalizationCollision,
            "A derived localization is empty or duplicates an existing key.");
      }

      TextsByLocale[locale].Add(textKey, text);
      var record = new JsonObject
      {
        ["locale"] = locale,
        ["text_key"] = textKey,
        ["text"] = text,
      };
      Records.Add(record);
      EvidenceRecords.Add(new SourceEvidenceRecord(
          CatalogCategories.RecordKey(CatalogCategory.Localizations, record),
          sourceInternalName,
          sources));
    }
  }

  private sealed record PalFact(
      string SourceName,
      string StableId,
      string Tribe,
      int BreedingPower,
      int BreedingPriority,
      bool IsVariant,
      int SourceOrder,
      string BpClass,
      string PartnerNameOverride,
      string PartnerDescriptionOverride);

  private sealed record PalFacts(IReadOnlyList<PalFact> Facts, ReaderResult Result);

  private sealed record ActiveFact(
      string SourceName,
      string StableId,
      string SourceRow,
      string ElementType,
      int Power,
      float CooldownSeconds,
      bool IsExclusive);

  private sealed record ActiveFacts(IReadOnlyDictionary<string, ActiveFact> Facts, ReaderResult Result);

  private sealed record ItemFact(
      string SourceName,
      string StableId,
      string TypeA,
      string TypeB,
      bool EnableHandcraft);

  private sealed record ItemFacts(IReadOnlyDictionary<string, ItemFact> Facts, ReaderResult Result);

  private sealed record ItemRedirect(string SourceRow, string SourceId, string DestinationId);

  private sealed record ItemRedirects(
      IReadOnlyDictionary<string, ItemRedirect> BySource,
      IReadOnlyDictionary<string, List<ItemRedirect>> ByDestination);

  private sealed record SpecialCombination(
      string SourceRow,
      PalFact ParentA,
      string GenderA,
      PalFact ParentB,
      string GenderB,
      PalFact Child)
  {
    public bool HasParents(PalFact a, PalFact b) =>
        ReferenceEquals(a, ParentA) && ReferenceEquals(b, ParentB)
        || ReferenceEquals(a, ParentB) && ReferenceEquals(b, ParentA);

    public bool Matches(PalFact a, string genderA, PalFact b, string genderB) =>
        MatchesOne(a, genderA, ParentA, GenderA) && MatchesOne(b, genderB, ParentB, GenderB)
        || MatchesOne(a, genderA, ParentB, GenderB) && MatchesOne(b, genderB, ParentA, GenderA);

    private static bool MatchesOne(PalFact actual, string actualGender, PalFact expected, string expectedGender) =>
        ReferenceEquals(actual, expected) && (expectedGender == "any" || expectedGender == actualGender);
  }

  private sealed record BreedingOutcome(
      string GenderA,
      string GenderB,
      PalFact Child,
      string RecipeType,
      SpecialCombination? Combination);
}
