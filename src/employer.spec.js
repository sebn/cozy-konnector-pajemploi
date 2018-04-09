const employer = require('./employer')

describe('employer', () => {
  describe('parsePeriod', () => {
    it('parses french-formatted month/year', () => {
      const period = employer.parsePeriod('01/2018')
      expect(period).toEqual(['2018', '01'])
    })

    it('parses ISO-like date string', () => {
      const period = employer.parsePeriod('2018-02-01 00:00:00.0')
      expect(period).toEqual(['2018', '02'])
    })
  })
})
