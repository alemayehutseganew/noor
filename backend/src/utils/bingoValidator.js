function validateBingo(cardMatrix, calledNumbers, markedNumbers) {
  if (
    !Array.isArray(cardMatrix) ||
    cardMatrix.length !== 5 ||
    cardMatrix.some((row) => !Array.isArray(row) || row.length !== 5) ||
    !Array.isArray(markedNumbers)
  ) {
    return { isValid: false, pattern: null }
  }

  const calledSet = new Set(Array.from(calledNumbers || [], Number))
  const markedSet = new Set(markedNumbers.map(Number))
  const cardNumbers = new Set(cardMatrix.flat()
    .filter((cell) => cell !== 'FREE')
    .map(Number))

  if (
    markedNumbers.some((number) => !Number.isFinite(Number(number))) ||
    Array.from(markedSet).some((number) => !calledSet.has(number) || !cardNumbers.has(number))
  ) {
    return { isValid: false, pattern: null }
  }

  // Helper to check if a cell is marked (FREE is always marked)
  const isMarked = (cell) => cell === 'FREE' || markedSet.has(Number(cell))

  // 1. Check Rows
  for (let r = 0; r < 5; r++) {
    if (cardMatrix[r].every(isMarked)) {
      return { isValid: true, pattern: `Row ${r + 1}` };
    }
  }

  // 2. Check Columns
  for (let c = 0; c < 5; c++) {
    let colWin = true;
    for (let r = 0; r < 5; r++) {
      if (!isMarked(cardMatrix[r][c])) { colWin = false; break; }
    }
    if (colWin) return { isValid: true, pattern: `Column ${c + 1}` };
  }

  // 3. Check Diagonals
  const diag1 = [cardMatrix[0][0], cardMatrix[1][1], cardMatrix[2][2], cardMatrix[3][3], cardMatrix[4][4]];
  if (diag1.every(isMarked)) return { isValid: true, pattern: 'Main Diagonal' };

  const diag2 = [cardMatrix[0][4], cardMatrix[1][3], cardMatrix[2][2], cardMatrix[3][1], cardMatrix[4][0]];
  if (diag2.every(isMarked)) return { isValid: true, pattern: 'Anti Diagonal' };

  // 4. Check Four Corners
  const corners = [cardMatrix[0][0], cardMatrix[0][4], cardMatrix[4][0], cardMatrix[4][4]];
  if (corners.every(isMarked)) return { isValid: true, pattern: 'Four Corners' };

  return { isValid: false, pattern: null };
}

module.exports = { validateBingo }
