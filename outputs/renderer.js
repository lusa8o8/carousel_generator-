(function initializeCarouselRenderer(global) {
  'use strict';

  const SERIF = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
  const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  const FONT_PRESETS = {
    editorial: SERIF,
    modern: SANS,
    display: 'Palatino Linotype, Book Antiqua, Georgia, serif',
    clean: SANS,
    mono: MONO,
    playfair: '"Playfair Display", serif',
    merriweather: '"Merriweather", serif',
    cormorant: '"Cormorant Garamond", serif',
    lora: '"Lora", serif',
    fraunces: '"Fraunces", serif',
    bodoni: '"Bodoni Moda", serif',
    inter: '"Inter", sans-serif',
    montserrat: '"Montserrat", sans-serif',
    oswald: '"Oswald", sans-serif',
    syne: '"Syne", sans-serif',
    outfit: '"Outfit", sans-serif',
    dancing: '"Dancing Script", cursive',
    great_vibes: '"Great Vibes", cursive',
    playfair_italic: 'italic "Playfair Display", serif',
    cormorant_italic: 'italic "Cormorant Garamond", serif',
    editorial_italic: 'italic ' + SERIF
  };

  const FORMATS = {
    ig_square:   { label: 'Instagram - Square',    dims: '1:1',    w: 1080, h: 1080 },
    ig_portrait: { label: 'Instagram - Portrait',  dims: '4:5',    w: 1080, h: 1350 },
    ig_story:    { label: 'Story / Reels',         dims: '9:16',   w: 1080, h: 1920 },
    linkedin:    { label: 'LinkedIn - Landscape',  dims: '1.91:1', w: 1200, h: 628 },
    pinterest:   { label: 'Pinterest',             dims: '2:3',    w: 1000, h: 1500 },
    twitter:     { label: 'X / Twitter',           dims: '16:9',   w: 1200, h: 675 },
    poster_a4:   { label: 'Poster - A4',           dims: '1:1.41', w: 1240, h: 1754 },
    poster_letter: { label: 'Poster - Letter',     dims: '8.5:11', w: 1275, h: 1650 },
    poster_18x24: { label: 'Poster - 18x24',       dims: '3:4',    w: 1350, h: 1800 }
  };

  const PALETTES = {
    oat:  { name: 'Oat & Ochre', paper: '#EFE9DA', ink: '#212B21', accent: '#C08A28' },
    ink:  { name: 'Ink & Amber', paper: '#202B24', ink: '#EEE7D6', accent: '#E3A94A' },
    bone: { name: 'Bone & Sage', paper: '#ECE7DC', ink: '#26241F', accent: '#6F7F5A' }
  };

  function getTheme(settings) {
    return settings.theme || settings;
  }

  function getSize(settings) {
    return FORMATS[settings.format] || FORMATS.ig_square;
  }

  function getActivePalette(settings) {
    const theme = getTheme(settings);
    return theme.brand?.enabled ? theme.brand : (PALETTES[theme.palette] || PALETTES.oat);
  }

  function getFonts(settings) {
    const brand = getTheme(settings).brand || {};
    return {
      headline: FONT_PRESETS[brand.headline] || SERIF,
      body: FONT_PRESETS[brand.body] || SANS,
      accent: FONT_PRESETS[brand.accentFont] || FONT_PRESETS.playfair_italic,
      label: MONO
    };
  }

  function parseSegments(text) {
    const segments = [];
    let i = 0;
    let current = '';
    let bold = false;
    let accent = false;
    let colorToken = null;
    let sizeToken = null;

    function flush() {
      if (current) {
        segments.push({ text: current, bold, accent, color: colorToken, size: sizeToken });
        current = '';
      }
    }

    while (i < text.length) {
      if (text[i] === '*' && text[i + 1] === '*') {
        flush();
        bold = !bold;
        i += 2;
        continue;
      }
      if (text[i] === '*') {
        flush();
        accent = !accent;
        i += 1;
        continue;
      }
      if (text[i] === '^') {
        flush();
        if (i + 1 < text.length && text[i + 1] === '^') {
          sizeToken = sizeToken === 'xl' ? null : 'xl';
          i += 2;
        } else {
          sizeToken = sizeToken === 'l' ? null : 'l';
          i += 1;
        }
        continue;
      }
      if (text[i] === '_') {
        flush();
        if (i + 1 < text.length && text[i + 1] === '_') {
          sizeToken = sizeToken === 'xs' ? null : 'xs';
          i += 2;
        } else {
          sizeToken = sizeToken === 's' ? null : 's';
          i += 1;
        }
        continue;
      }
      if (text[i] === '~') {
        flush();
        if (colorToken === null) {
          i += 1;
          if (i < text.length - 1 && 'apwk'.includes(text[i]) && text[i + 1] === ':') {
            colorToken = text[i];
            i += 2;
          } else {
            colorToken = 'a';
          }
        } else {
          colorToken = null;
          i += 1;
        }
        continue;
      }
      current += text[i];
      i++;
    }
    flush();
    return segments;
  }

  function resolveColor(token, palette) {
    if (!token) return null;
    if (token === 'a') return palette.accent;
    if (token === 'p') return palette.paper;
    if (token === 'w') return '#FFFFFF';
    if (token === 'k') return '#000000';
    return null;
  }

  function segmentFont(seg, baseFont, accentFont) {
    let font = seg.accent && accentFont ? accentFont : baseFont;
    
    font = font.replace(/(\d+)(px)/, (_, sizeStr, unit) => {
      let size = parseInt(sizeStr, 10);
      if (seg.size === 'xl') size = Math.round(size * 1.5);
      if (seg.size === 'l') size = Math.round(size * 1.25);
      if (seg.size === 's') size = Math.round(size * 0.8);
      if (seg.size === 'xs') size = Math.round(size * 0.6);
      return size + unit;
    });

    if (seg.bold) {
      font = font.replace(/^(italic\s+)?(\d+)\s/, (_, it, w) => (it || '') + '700 ');
    }
    return font;
  }

  function hasMarkers(txt) {
    return txt.includes('*') || txt.includes('~') || txt.includes('^') || txt.includes('_');
  }

  function measureMixed(ctx, txt, baseFont, accentFont) {
    if (!hasMarkers(txt)) return ctx.measureText(txt).width;
    const segments = parseSegments(txt);
    let w = 0;
    const origFont = ctx.font;
    for (const seg of segments) {
      ctx.font = segmentFont(seg, baseFont, accentFont);
      w += ctx.measureText(seg.text).width;
    }
    ctx.font = origFont;
    return w;
  }

  function drawMixedText(ctx, txt, x, y, baseFont, accentFont, align, palette) {
    if (!hasMarkers(txt)) {
      ctx.font = baseFont;
      ctx.textAlign = align;
      ctx.fillText(txt, x, y);
      return;
    }

    const totalW = measureMixed(ctx, txt, baseFont, accentFont);
    let startX = x;
    if (align === 'center') startX = x - totalW / 2;
    else if (align === 'right') startX = x - totalW;

    ctx.textAlign = 'left';
    const origColor = ctx.fillStyle;
    const segments = parseSegments(txt);
    for (const seg of segments) {
      ctx.font = segmentFont(seg, baseFont, accentFont);
      const resolved = resolveColor(seg.color, palette);
      ctx.fillStyle = resolved || origColor;
      if (seg.text) ctx.fillText(seg.text, startX, y);
      startX += ctx.measureText(seg.text).width;
    }
    ctx.fillStyle = origColor;
    ctx.font = baseFont;
  }

  function fixMarkersAcrossLines(lines) {
    let bold = false;
    let accent = false;
    let colorOpen = null;
    let sz = null;
    const fixed = [];

    for (let li = 0; li < lines.length; li++) {
      let line = lines[li];
      let prefix = '';
      if (bold) prefix += '**';
      if (accent) prefix += '*';
      if (colorOpen) prefix += colorOpen;
      if (sz === 'xl') prefix += '^^';
      if (sz === 'l') prefix += '^';
      if (sz === 's') prefix += '_';
      if (sz === 'xs') prefix += '__';
      line = prefix + line;

      let b = false, a = false, col = null, s = null;
      let ci = 0;
      while (ci < line.length) {
        if (line[ci] === '*' && line[ci + 1] === '*') { b = !b; ci += 2; continue; }
        if (line[ci] === '*') { a = !a; ci += 1; continue; }
        if (line[ci] === '~') {
          if (col === null) {
            ci += 1;
            if (ci < line.length - 1 && 'apwk'.includes(line[ci]) && line[ci + 1] === ':') {
              col = '~' + line[ci] + ':';
              ci += 2;
            } else {
              col = '~';
            }
          } else {
            col = null;
            ci += 1;
          }
          continue;
        }
        if (line[ci] === '^' && line[ci + 1] === '^') { s = s === 'xl' ? null : 'xl'; ci += 2; continue; }
        if (line[ci] === '^') { s = s === 'l' ? null : 'l'; ci++; continue; }
        if (line[ci] === '_' && line[ci + 1] === '_') { s = s === 'xs' ? null : 'xs'; ci += 2; continue; }
        if (line[ci] === '_') { s = s === 's' ? null : 's'; ci++; continue; }
        ci++;
      }

      let suffix = '';
      if (col) suffix += '~';
      if (s === 'xl') suffix += '^^';
      if (s === 'l') suffix += '^';
      if (s === 's') suffix += '_';
      if (s === 'xs') suffix += '__';
      if (a) suffix += '*';
      if (b) suffix += '**';
      line = line + suffix;

      bold = b;
      accent = a;
      colorOpen = col;
      sz = s;
      fixed.push(line);
    }
    return fixed;
  }

  function wrapLines(ctx, text, maxWidth, balance = false, accentFont = null) {
    const rawLines = String(text || '').split('\n');
    const finalLines = [];

    for (let i = 0; i < rawLines.length; i++) {
      const words = rawLines[i].split(/\s+/).filter(Boolean);
      if (!words.length) {
        if (i < rawLines.length - 1 || rawLines[i] === '\n') finalLines.push('');
        continue;
      }

      function wrapAt(width) {
        const lines = [];
        let current = '';
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (measureMixed(ctx, test, ctx.font, accentFont) > width && current) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        }
        if (current) lines.push(current);
        return lines;
      }

      const unconstrained = wrapAt(maxWidth);
      if (!balance || unconstrained.length <= 1) {
        finalLines.push(...unconstrained);
        continue;
      }

      const targetLines = unconstrained.length;
      let minW = Math.max(...words.map(w => measureMixed(ctx, w, ctx.font, accentFont)));
      let maxW = maxWidth;
      let best = unconstrained;

      while (maxW - minW > 2) {
        const mid = minW + (maxW - minW) / 2;
        const testLines = wrapAt(mid);
        if (testLines.length <= targetLines) {
          best = testLines;
          maxW = mid;
        } else {
          minW = mid;
        }
      }
      finalLines.push(...best);
    }
    
    while (finalLines.length && finalLines[finalLines.length - 1] === '') {
      finalLines.pop();
    }
    return hasMarkers(text) ? fixMarkersAcrossLines(finalLines) : finalLines;
  }

  function fitText(ctx, text, family, weight, maxWidth, maxLines, startSize, minSize, balance = false, accentFamily = null) {
    let size = startSize;
    let accentFontStr = null;
    while (size >= minSize) {
      ctx.font = `${weight} ${size}px ${family}`;
      if (accentFamily) {
        const isItalic = accentFamily.startsWith('italic ');
        const aFam = isItalic ? accentFamily.replace('italic ', '') : accentFamily;
        accentFontStr = `${isItalic ? 'italic ' : ''}400 ${size * 1.15}px ${aFam}`;
      }
      const lines = wrapLines(ctx, text, maxWidth, balance, accentFontStr);
      if (lines.length <= maxLines) return { size, lines, truncated: false, naturalLineCount: lines.length, accentFontStr };
      size -= 2;
    }

    ctx.font = `${weight} ${minSize}px ${family}`;
    if (accentFamily) {
        const isItalic = accentFamily.startsWith('italic ');
        const aFam = isItalic ? accentFamily.replace('italic ', '') : accentFamily;
        accentFontStr = `${isItalic ? 'italic ' : ''}400 ${minSize * 1.15}px ${aFam}`;
    }
    const naturalLines = wrapLines(ctx, text, maxWidth, balance, accentFontStr);
    const lines = naturalLines.slice(0, maxLines);
    if (naturalLines.length > maxLines) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, '')}\u2026`;
    }
    return {
      size: minSize,
      lines,
      truncated: naturalLines.length > maxLines,
      naturalLineCount: naturalLines.length,
      accentFontStr
    };
  }

  function drawTracked(ctx, text, x, y, tracking) {
    let currentX = x;
    for (const character of text) {
      ctx.fillText(character, currentX, y);
      currentX += ctx.measureText(character).width + tracking;
    }
  }

  function drawSlide(ctx, slide, index, total, settings) {
    const issues = [];
    const palette = getActivePalette(settings);
    const fonts = getFonts(settings);
    const size = getSize(settings);
    const theme = getTheme(settings);
    const width = size.w;
    const height = size.h;
    const unit = Math.min(width, height) / 1080;
    const margin = Math.round(84 * unit);
    const small = Math.max(12, Math.round(20 * unit));
    const contentInset = Math.round(66 * unit);
    const footerInset = Math.round(34 * unit);
    const footerY = height - margin - footerInset;

    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, width, height);

    if (slide.bgImageObj) {
      const img = slide.bgImageObj;
      const imgRatio = img.width / img.height;
      const targetRatio = width / height;
      let sx, sy, sWidth, sHeight;
      if (imgRatio > targetRatio) {
        sHeight = img.height;
        sWidth = img.height * targetRatio;
        sy = 0;
        sx = (img.width - sWidth) / 2;
      } else {
        sWidth = img.width;
        sHeight = img.width / targetRatio;
        sx = 0;
        sy = (img.height - sHeight) / 2;
      }
      
      const b = slide.bgSettings?.brightness ?? 100;
      const c = slide.bgSettings?.contrast ?? 100;
      ctx.filter = `brightness(${b}%) contrast(${c}%)`;
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, width, height);
      ctx.filter = 'none';
    } else if (slide.bgGradient) {
      const g = slide.bgGradient;
      const angle = (g.angle - 90) * (Math.PI / 180);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.sqrt(width * width + height * height) / 2;
      
      const x1 = cx + Math.cos(angle + Math.PI) * radius;
      const y1 = cy + Math.sin(angle + Math.PI) * radius;
      const x2 = cx + Math.cos(angle) * radius;
      const y2 = cy + Math.sin(angle) * radius;
      
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, g.color1);
      grad.addColorStop(1, g.color2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }



    if (theme.showMargin) {
      ctx.strokeStyle = palette.ink;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);
      ctx.globalAlpha = 1;
    }

    if (settings.category !== 'poster') {
      ctx.font = `600 ${small}px ${fonts.label}`;
      ctx.fillStyle = palette.accent;
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(margin + 24 * unit, margin + 30 * unit);
      const tag = String(settings.seriesTag || '').toUpperCase() + (slide.isCover ? '' : '  -  TIP');
      drawTracked(ctx, tag, 0, 0, 2.4);
      ctx.restore();
    }

    const contentLeft = margin + contentInset;
    const contentRight = width - margin - Math.round(56 * unit);
    const contentWidth = contentRight - contentLeft;
    const textAlign = slide.layout?.align === 'center' ? 'center' : 'left';
    const textX = textAlign === 'center' ? contentLeft + contentWidth / 2 : contentLeft;
    const titleScale = Math.max(0.5, Math.min(1.8, slide.layout?.titleScale || 1));
    const bodyScale = Math.max(0.5, Math.min(1.8, slide.layout?.bodyScale || 1));
    let contentBottom = 0;
    ctx.textAlign = textAlign;

    if (settings.category === 'poster') {
      const maxLines = 8;
      // Posters get a wider effective content area to let text breathe
      const posterContentWidth = width - (margin * 2); 
      const titleFit = fitText(
        ctx,
        slide.title,
        fonts.headline,
        '700',
        posterContentWidth,
        maxLines,
        Math.max(64 * unit, Math.round(Math.min(width, height) * 0.1)) * titleScale,
        40 * unit,
        true, // Enable text balancing for poster headlines
        fonts.accent
      );
      reportTruncation(issues, slide, 'title', titleFit);
      
      const lineHeight = titleFit.size * 1.15;
      const totalTitleHeight = lineHeight * titleFit.lines.length;
      
      let bodyFit = null;
      let totalBodyHeight = 0;
      if (slide.body) {
         bodyFit = fitText(ctx, slide.body, fonts.body, '400', posterContentWidth * 0.8, 12, 36 * unit * bodyScale, 20 * unit, true);
         reportTruncation(issues, slide, 'body', bodyFit);
         totalBodyHeight = bodyFit.size * 1.4 * bodyFit.lines.length;
      }
      
      const totalContentHeight = totalTitleHeight + (bodyFit ? 40 * unit + totalBodyHeight : 0);
      const centerX = width / 2;
      let textY = height / 2 - totalContentHeight / 2 + titleFit.size * 0.8;
      
      // Draw Supertitle (seriesTag)
      if (settings.seriesTag) {
        ctx.font = `600 ${small * 1.2}px ${fonts.label}`;
        ctx.fillStyle = palette.accent;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(centerX, textY - titleFit.size * 1.2);
        drawTracked(ctx, String(settings.seriesTag).toUpperCase(), -ctx.measureText(settings.seriesTag).width / 2, 0, 3);
        ctx.restore();
      }

      // Draw Headline
      ctx.fillStyle = palette.ink;
      ctx.textBaseline = 'alphabetic';
      const baseFontStr = `700 ${titleFit.size}px ${fonts.headline}`;
      titleFit.lines.forEach((line) => {
        drawMixedText(ctx, line, centerX, textY, baseFontStr, titleFit.accentFontStr, 'center', palette);
        textY += lineHeight;
      });
      contentBottom = textY;
      
      // Draw Subheadline
      if (slide.body) {
        const bodyFit = fitText(ctx, slide.body, fonts.body, '400', contentWidth, 12, 30 * unit * bodyScale, 17 * unit, false, fonts.accent);
        reportTruncation(issues, slide, 'body', bodyFit);
        ctx.font = `400 ${bodyFit.size}px ${fonts.body}`;
        ctx.fillStyle = palette.ink;
        ctx.globalAlpha = 0.8;
        let bodyY = textY + 20 * unit;
        const bodyBaseFontStr = `400 ${bodyFit.size}px ${fonts.body}`;
        bodyFit.lines.forEach((line) => {
          drawMixedText(ctx, line, centerX, bodyY, bodyBaseFontStr, bodyFit.accentFontStr, 'center', palette);
          bodyY += bodyFit.size * 1.4;
        });
        contentBottom = bodyY;
        ctx.globalAlpha = 1;
      }

      // Draw Details / Footer (handle)
      if (settings.handle) {
        ctx.font = `500 ${small * 1.2}px ${fonts.body}`;
        ctx.fillStyle = palette.ink;
        ctx.globalAlpha = 0.9;
        ctx.textAlign = 'center';
        ctx.fillText(settings.handle, centerX, height - margin - 40 * unit);
        ctx.globalAlpha = 1;
      }

    } else if (slide.isCover) {
      const maxLines = width > height ? 4 : height > width * 1.3 ? 6 : 5;
      const titleFit = fitText(
        ctx,
        slide.title,
        fonts.headline,
        '700',
        contentWidth,
        maxLines,
        Math.max(44 * unit, Math.round(Math.min(width, height) * 0.07)) * titleScale,
        32 * unit,
        false,
        fonts.accent
      );
      reportTruncation(issues, slide, 'title', titleFit);
      ctx.fillStyle = palette.ink;
      ctx.textBaseline = 'alphabetic';
      const lineHeight = titleFit.size * 1.16;
      const totalHeight = lineHeight * titleFit.lines.length;
      let textY = height / 2 - totalHeight / 2 + titleFit.size * 0.8;
      const baseFontStr = `700 ${titleFit.size}px ${fonts.headline}`;
      titleFit.lines.forEach((line) => {
        drawMixedText(ctx, line, textX, textY, baseFontStr, titleFit.accentFontStr, textAlign, palette);
        textY += lineHeight;
      });
      contentBottom = textY;

      if (slide.body) {
        const bodyFit = fitText(ctx, slide.body, fonts.body, '400', contentWidth, 12, 30 * unit * bodyScale, 17 * unit, false, fonts.accent);
        reportTruncation(issues, slide, 'body', bodyFit);
        ctx.font = `400 ${bodyFit.size}px ${fonts.body}`;
        ctx.fillStyle = palette.ink;
        ctx.globalAlpha = 0.75;
        let bodyY = textY + 20 * unit;
        const bodyBaseFontStr = `400 ${bodyFit.size}px ${fonts.body}`;
        bodyFit.lines.forEach((line) => {
          drawMixedText(ctx, line, textX, bodyY, bodyBaseFontStr, bodyFit.accentFontStr, textAlign, palette);
          bodyY += bodyFit.size * 1.4;
        });
        contentBottom = bodyY;
        ctx.globalAlpha = 1;
      }
    } else {
      const titleFit = fitText(
        ctx,
        slide.title,
        fonts.headline,
        '700',
        contentWidth,
        width > height ? 3 : 4,
        64 * unit * titleScale,
        30 * unit,
        false,
        fonts.accent
      );
      reportTruncation(issues, slide, 'title', titleFit);
      ctx.fillStyle = palette.ink;
      const lineHeight = titleFit.size * 1.18;
      let textY = height / 2 - (lineHeight * titleFit.lines.length) / 2 - (slide.body ? 30 * unit : 0);
      const baseFontStr = `700 ${titleFit.size}px ${fonts.headline}`;
      titleFit.lines.forEach((line) => {
        drawMixedText(ctx, line, textX, textY, baseFontStr, titleFit.accentFontStr, textAlign, palette);
        textY += lineHeight;
      });
      textY += 34 * unit;
      contentBottom = textY;

      if (slide.body) {
        const bodyFit = fitText(ctx, slide.body, fonts.body, '400', contentWidth, 12, 30 * unit * bodyScale, 17 * unit, false, fonts.accent);
        reportTruncation(issues, slide, 'body', bodyFit);
        ctx.font = `400 ${bodyFit.size}px ${fonts.body}`;
        ctx.fillStyle = palette.ink;
        ctx.globalAlpha = 0.78;
        const bodyBaseFontStr = `400 ${bodyFit.size}px ${fonts.body}`;
        bodyFit.lines.forEach((line) => {
          drawMixedText(ctx, line, textX, textY, bodyBaseFontStr, bodyFit.accentFontStr, textAlign, palette);
          textY += bodyFit.size * 1.46;
        });
        contentBottom = textY;
        ctx.globalAlpha = 1;
      }
    }

    const footerClearance = Math.round(38 * unit);
    if (contentBottom > footerY - footerClearance) {
      issues.push({
        path: `slides[${index}]`,
        slideId: slide.id,
        code: 'footer_overlap',
        message: 'Slide content reaches the reserved footer area.',
        severity: 'error',
        measured: { contentBottom: Math.round(contentBottom), footerTop: Math.round(footerY - footerClearance) }
      });
    }

    if (settings.category !== 'poster') {
      ctx.font = `500 ${small}px ${fonts.label}`;
      ctx.fillStyle = palette.ink;
      ctx.globalAlpha = 0.7;
      ctx.textAlign = 'left';
      ctx.fillText(settings.handle || '', contentLeft, footerY);
      ctx.globalAlpha = 1;
    }

    return {
      slideId: slide.id,
      index,
      issues,
      measurements: {
        width,
        height,
        contentLeft,
        contentRight,
        contentBottom: Math.round(contentBottom),
        footerY: Math.round(footerY)
      }
    };
  }

  function reportTruncation(issues, slide, field, fit) {
    if (!fit.truncated) return;
    issues.push({
      path: `slides.${slide.id}.${field}`,
      slideId: slide.id,
      code: 'text_truncated',
      message: `${field === 'title' ? 'Title' : 'Body'} text requires ${fit.naturalLineCount} lines but only ${fit.lines.length} fit.`,
      severity: 'error',
      measured: { naturalLineCount: fit.naturalLineCount, renderedLineCount: fit.lines.length }
    });
  }

  global.CarouselRenderer = Object.freeze({
    FORMATS,
    PALETTES,
    getSize,
    drawSlide
  });
}(window));
