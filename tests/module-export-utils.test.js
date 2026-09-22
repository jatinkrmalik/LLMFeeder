describe('ModuleExportUtils', () => {
  let ModuleExportUtils;

  beforeEach(() => {
    jest.resetModules();
    ModuleExportUtils = require('../extension/module-export-utils.js');
  });

  it('recognizes Microsoft Learn module indexes', () => {
    expect(ModuleExportUtils.isModuleIndexUrl(
      'https://learn.microsoft.com/en-us/training/modules/describe-cloud-service-types/?view=1'
    )).toBe(true);
    expect(ModuleExportUtils.isModuleIndexUrl(
      'https://learn.microsoft.com/en-us/training/modules/describe-cloud-service-types/1-introduction/'
    )).toBe(false);
  });

  it('keeps ordered unit links and excludes navigation and unrelated links', () => {
    const currentUrl = 'https://learn.microsoft.com/en-us/training/modules/example/';
    const links = ModuleExportUtils.discoverUnitLinks([
      { href: 'https://learn.microsoft.com/en-us/training/modules/example/2-second/' },
      { href: '/en-us/training/modules/other/1-first/' },
      { href: 'https://learn.microsoft.com/en-us/training/modules/example/' },
      { href: 'https://learn.microsoft.com/en-us/training/modules/example/1-first/' },
      { href: 'https://learn.microsoft.com/en-us/training/modules/example/2-second/' },
      { href: 'https://learn.microsoft.com/en-us/training/modules/example/1-first/?wt.mc_id=x' },
      { href: 'https://learn.microsoft.com/en-us/training/paths/example/' }
    ], currentUrl);

    expect(links).toEqual([
      'https://learn.microsoft.com/en-us/training/modules/example/2-second',
      'https://learn.microsoft.com/en-us/training/modules/example/1-first'
    ]);
  });

  it('generates stable numbered filenames from unit URLs', () => {
    expect(ModuleExportUtils.filenameForUnitUrl(
      'https://learn.microsoft.com/en-us/training/modules/example/1-introduction', 0
    )).toBe('01-1-introduction.md');
    expect(ModuleExportUtils.filenameForIndexTitle(
      'Building Applications with GitHub Copilot Agent Mode - Training | Microsoft Learn'
    )).toBe('00-Building_Applications_with_GitHub_Copilot_Agent_Mode_-_Training_Microsoft_Learn.md');
  });

  it('rejects empty output and precise landing/error markers without rejecting ordinary prose', () => {
    expect(ModuleExportUtils.validateMarkdown('   ', 'https://learn.microsoft.com/en-us/training/modules/example/')).toEqual({
      valid: false,
      error: 'Conversion produced empty Markdown'
    });
    expect(ModuleExportUtils.validateMarkdown(
      'Please sign in to view this page',
      'https://learn.microsoft.com/en-us/training/modules/example/1-introduction'
    ).valid).toBe(false);
    expect(ModuleExportUtils.validateMarkdown(
      'This guide explains sign in errors and how to recover from errors.',
      'https://learn.microsoft.com/en-us/training/modules/example/1-introduction'
    )).toEqual({ valid: true });
  });

  it('requires complete formatted content for knowledge checks', () => {
    const url = 'https://learn.microsoft.com/en-us/training/modules/example/5-knowledge-check';
    expect(ModuleExportUtils.validateMarkdown('### Question 1\n\nA short prompt', url).valid).toBe(false);
    expect(ModuleExportUtils.validateMarkdown([
      '## Knowledge check',
      '',
      '### Question 1',
      '',
      'Which option is correct?',
      '',
      '**Answer choices**',
      '',
      '- The first answer choice is correct.',
      '- The second answer choice is not correct.',
      '- The third answer choice is also not correct.'
    ].join('\n'), url)).toEqual({ valid: true });
  });

  it('detects collisions in generated filenames without changing their numbering', () => {
    const urls = [
      'https://learn.microsoft.com/en-us/training/modules/example/1-a:b',
      'https://learn.microsoft.com/en-us/training/modules/example/1-ab'
    ];
    const filenames = ModuleExportUtils.expectedFilenames('Example', urls);

    expect(filenames).toEqual(['00-Example.md', '01-1-ab.md', '02-1-ab.md']);
    expect(ModuleExportUtils.findFilenameCollisions(filenames)).toEqual([]);
    expect(ModuleExportUtils.findFilenameCollisions([
      '00-Example.md',
      ModuleExportUtils.filenameForUnitUrl(urls[0], 0),
      ModuleExportUtils.filenameForUnitUrl(urls[1], 0)
    ])).toEqual(['01-1-ab.md']);
  });

  it('validates export requests stay within one Microsoft Learn module', () => {
    const request = {
      exportId: 'module-123-test',
      sourceTabId: 42,
      moduleUrl: 'https://learn.microsoft.com/en-us/training/modules/example/',
      urls: ['https://learn.microsoft.com/en-us/training/modules/example/1-introduction'],
      settings: {}
    };

    expect(ModuleExportUtils.validateExportRequest(request)).toEqual({ valid: true });
    expect(ModuleExportUtils.validateExportRequest({
      ...request,
      urls: ['https://learn.microsoft.com/en-us/training/modules/other/1-introduction']
    }).valid).toBe(false);
    expect(ModuleExportUtils.validateExportRequest({
      ...request,
      moduleUrl: 'https://example.com/training/modules/example/'
    }).valid).toBe(false);
    expect(ModuleExportUtils.validateExportRequest({ ...request, settings: [] }).valid).toBe(false);
  });
});
