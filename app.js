const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const databasePath = path.join(__dirname, 'covid19IndiaPortal.db')

const app = express()

app.use(express.json())

let database = null

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () =>
      console.log('Server Running at http://localhost:3000/'),
    )
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const convertStateDbObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertDistrictDbObjectToResponseObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await database.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/states/', authenticateToken, async (request, response) => {
  const getstatesQuery = `
    SELECT
      *
    FROM
      state;`
  const statesArray = await database.all(getstatesQuery)
  console.log(statesArray)
  response.send(
    statesArray.map(eachState =>
      convertStateDbObjectToResponseObject(eachState),
    ),
  )
})

app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
    SELECT 
      *
    FROM 
      state 
    WHERE 
      state_id = ${stateId};`
  const state = await database.get(getStateQuery)
  response.send(convertStateDbObjectToResponseObject(state))
})

app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const postDistrictQuery = `
  INSERT INTO
    district ( district_name, state_id, cases, cured, active, deaths)
  VALUES
    ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`
  await database.run(postDistrictQuery)
  response.send('District Successfully Added')
})

app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `
    SELECT
      *
    FROM
      district
    WHERE
      district_id=${districtId};`
    const districtsArray = await database.get(getDistrictQuery)
    response.send(convertDistrictDbObjectToResponseObject(districtsArray))
  },
)

app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
  DELETE FROM
    district
  WHERE
    district_id = ${districtId};`
    await database.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const {districtId} = request.params
    const updateDistrictQuery = `
            UPDATE
              district
            SET
              district_name = '${districtName}',
              state_id = ${stateId},
              cases = ${cases},
              cured = ${cured},
              active = ${active},
              deaths = ${deaths}
            WHERE
              district_id = ${districtId};`

    await database.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStatisticsQuery = `
    SELECT
      sum(cases) as totalCases,
      sum(cured) as totalCured,
      sum(active) as totalActive,
      sum(deaths) as totalDeaths
    FROM
      district
    WHERE
      state_id= ${stateId};`
    const stats = await database.get(getStatisticsQuery)
    response.send({
      totalCases: stats['totalCases'],
      totalCured: stats['totalCured'],
      totalActive: stats['totalActive'],
      totalDeaths: stats['totalDeaths'],
    })
  },
)

app.get(
  '/districts/:districtId/details',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getStateNameQuery = `
    SELECT
      state_name
    FROM
      district as d
      inner join state as s
      on d.state_id = s.state_id
    WHERE
      district_id= ${districtId};`
    const stateName = await database.get(getStateNameQuery)
    response.send({
      stateName: `${stateName.state_name}`,
    })
  },
)

module.exports = app
