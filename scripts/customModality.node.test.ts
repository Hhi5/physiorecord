import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomModalityChip,
  buildCustomPhysicalAgentEntry,
  compileFlowsheetSummaryText,
  getPhysicalAgentDisplayLabel,
} from '../src/components/workspace/session/sessionSoapHelpers';

test('getPhysicalAgentDisplayLabel preserves custom modality name across Arabic, English, and Kurdish', () => {
  const customEntry = { modality: 'Other' as const, modalityAr: 'Tecar Therapy' };
  assert.equal(getPhysicalAgentDisplayLabel(customEntry, 'ar'), 'Tecar Therapy');
  assert.equal(getPhysicalAgentDisplayLabel(customEntry, 'en'), 'Tecar Therapy');
  assert.equal(getPhysicalAgentDisplayLabel(customEntry, 'ckb'), 'Tecar Therapy');

  const blankCustom = { modality: 'Other' as const, modalityAr: '   ' };
  assert.equal(getPhysicalAgentDisplayLabel(blankCustom, 'ar'), 'جهاز مخصص');
  assert.equal(getPhysicalAgentDisplayLabel(blankCustom, 'en'), 'Custom Modality');
  assert.equal(getPhysicalAgentDisplayLabel(blankCustom, 'ckb'), 'ئامێری تایبەت');

  const builtIn = { modality: 'TENS' as const, modalityAr: 'تحفيز كهربائي TENS' };
  assert.equal(getPhysicalAgentDisplayLabel(builtIn, 'ar'), 'تحفيز كهربائي TENS');
  assert.equal(getPhysicalAgentDisplayLabel(builtIn, 'en'), 'TENS');
});

test('buildCustomPhysicalAgentEntry validates required name and 1..120 duration range', () => {
  assert.equal(buildCustomPhysicalAgentEntry({ name: '   ' }), null);
  assert.equal(buildCustomPhysicalAgentEntry({ name: 'Tecar', durationMinutes: 0 }), null);
  assert.equal(buildCustomPhysicalAgentEntry({ name: 'Tecar', durationMinutes: 121 }), null);
  assert.equal(buildCustomPhysicalAgentEntry({ name: 'Tecar', durationMinutes: 12.5 }), null);

  const entry = buildCustomPhysicalAgentEntry({
    id: 'pa-custom-1',
    name: '  Tecar Therapy  ',
    parameters: ' 448kHz Capacitive ',
    durationMinutes: 20,
    fallbackSite: 'Lumbar Spine',
  });
  assert.ok(entry);
  assert.equal(entry.id, 'pa-custom-1');
  assert.equal(entry.modality, 'Other');
  assert.equal(entry.modalityAr, 'Tecar Therapy');
  assert.equal(entry.site, 'Lumbar Spine');
  assert.equal(entry.parameters, '448kHz Capacitive');
  assert.equal(entry.durationMinutes, 20);
});

test('buildCustomModalityChip creates reusable Other modality quick chip', () => {
  assert.equal(buildCustomModalityChip({ name: '' }), null);

  const chip = buildCustomModalityChip({
    id: 'chip-custom-1',
    name: 'HILT Laser',
    parameters: '1064nm, 1200J',
    durationMinutes: 12,
  });
  assert.ok(chip);
  assert.equal(chip.category, 'modality');
  assert.equal(chip.modalityType, 'Other');
  assert.equal(chip.labelAr, 'HILT Laser');
  assert.equal(chip.labelEn, 'HILT Laser');
  assert.equal(chip.modalityParams, '1064nm, 1200J');
  assert.equal(chip.durationMinutes, 12);
});

test('compileFlowsheetSummaryText formats custom modality name cleanly in both Arabic and English', () => {
  const customEntry = buildCustomPhysicalAgentEntry({
    id: 'pa-1',
    name: 'Tecar Therapy',
    site: 'Right Shoulder',
    parameters: '448kHz',
    durationMinutes: 20,
  });
  assert.ok(customEntry);

  const flowsheet = {
    exercises: [],
    manualTherapy: [],
    physicalAgents: [customEntry],
  };

  assert.equal(
    compileFlowsheetSummaryText(flowsheet, true),
    'Tecar Therapy (Right Shoulder, 448kHz, 20m)'
  );
  assert.equal(
    compileFlowsheetSummaryText(flowsheet, false),
    'Tecar Therapy (Right Shoulder, 448kHz, 20m)'
  );
});
